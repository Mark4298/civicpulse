import type { Complaint, District } from "@civicpulse/shared";

export interface EngineInput {
  cmd: "analyze" | "nearest" | "topk";
  complaints?: Complaint[];
  districts?: District[];
  point?: { lat: number; lng: number };
  lat?: number;
  lng?: number;
  k?: number;
  radiusMeters?: number;
  minPoints?: number;
  duplicateRadiusMeters?: number;
}

export type EngineOutput = Record<string, unknown>;

const earthRadiusMeters = 6_371_008.8;

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, value)));
}

// Emergency fallback favors simple correctness; its pairwise spatial work is O(n^2).
function deduplicate(complaints: Complaint[], radiusMeters: number): Complaint[] {
  const parents = complaints.map((_, index) => index);
  const ranks = new Array<number>(complaints.length).fill(0);
  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index]!);
    return parents[index]!;
  };
  const unite = (left: number, right: number) => {
    let leftRoot = find(left);
    let rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot]! < ranks[rightRoot]!) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    parents[rightRoot] = leftRoot;
    if (ranks[leftRoot] === ranks[rightRoot]) ranks[leftRoot]! += 1;
  };

  for (let left = 0; left < complaints.length; left += 1) {
    for (let right = left + 1; right < complaints.length; right += 1) {
      if (
        complaints[left]!.category === complaints[right]!.category &&
        distanceMeters(
          complaints[left]!.lat,
          complaints[left]!.lng,
          complaints[right]!.lat,
          complaints[right]!.lng,
        ) <= radiusMeters
      ) {
        unite(left, right);
      }
    }
  }

  const seen = new Set<number>();
  return complaints.filter((_, index) => {
    const root = find(index);
    if (seen.has(root)) return false;
    seen.add(root);
    return true;
  });
}

// Emergency fallback uses direct neighbor scans, O(n^2), rather than a spatial index.
function cluster(complaints: Complaint[], radiusMeters: number, minPoints: number) {
  const labels = new Array<number>(complaints.length).fill(-2);
  const getNeighbors = (index: number) =>
    complaints.flatMap((candidate, candidateIndex) =>
      distanceMeters(
        complaints[index]!.lat,
        complaints[index]!.lng,
        candidate.lat,
        candidate.lng,
      ) <= radiusMeters
        ? [candidateIndex]
        : [],
    );
  let clusterId = 0;

  for (let seed = 0; seed < complaints.length; seed += 1) {
    if (labels[seed] !== -2) continue;
    const neighbors = getNeighbors(seed);
    if (neighbors.length < minPoints) {
      labels[seed] = -1;
      continue;
    }
    labels[seed] = clusterId;
    const queue = [...neighbors.filter((index) => index !== seed)];
    const queued = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      if (labels[current] === -1) labels[current] = clusterId;
      if (labels[current] !== -2) continue;
      labels[current] = clusterId;
      const nearby = getNeighbors(current);
      if (nearby.length >= minPoints) {
        for (const neighbor of nearby) {
          if (labels[neighbor] === -2 && !queued.has(neighbor)) {
            queued.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
    clusterId += 1;
  }

  const groups = new Map<number, Complaint[]>();
  labels.forEach((label, index) => {
    if (label < 0) return;
    const group = groups.get(label) ?? [];
    group.push(complaints[index]!);
    groups.set(label, group);
  });
  return [...groups.entries()].map(([id, members]) => ({
    clusterId: id,
    centroid: {
      lat: members.reduce((sum, member) => sum + member.lat, 0) / members.length,
      lng: members.reduce((sum, member) => sum + member.lng, 0) / members.length,
    },
    memberCount: members.length,
  }));
}

function aggregate(complaints: Complaint[]) {
  const values = new Map<
    string,
    { count: number; severitySum: number; categories: Map<string, number> }
  >();
  for (const complaint of complaints) {
    const current = values.get(complaint.districtId) ?? {
      count: 0,
      severitySum: 0,
      categories: new Map<string, number>(),
    };
    current.count += 1;
    current.severitySum += complaint.severity;
    current.categories.set(
      complaint.category,
      (current.categories.get(complaint.category) ?? 0) + 1,
    );
    values.set(complaint.districtId, current);
  }
  return values;
}

function rank(districts: District[], complaints: Complaint[], k: number) {
  const aggregates = aggregate(complaints);
  return districts
    .flatMap((district) => {
      const stats = aggregates.get(district.id);
      if (!stats) return [];
      const categories = Object.fromEntries(stats.categories);
      const topCategory = [...stats.categories.entries()].sort(
        ([leftName, leftCount], [rightName, rightCount]) =>
          rightCount - leftCount || leftName.localeCompare(rightName),
      )[0]?.[0];
      const avgSeverity = stats.severitySum / stats.count;
      return [
        {
          districtId: district.id,
          districtName: district.name,
          priorityScore: (stats.count * avgSeverity) / Math.max(district.infraScore, 1),
          avgSeverity,
          complaintCount: stats.count,
          topCategory: topCategory ?? "",
          categoryFrequency: categories,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.priorityScore - left.priorityScore || left.districtId.localeCompare(right.districtId),
    )
    .slice(0, Math.max(0, k));
}

// Dispatches the same public command shapes as the C++ binary.
export function runEngineFallback(input: EngineInput): EngineOutput {
  const districts = input.districts ?? [];
  const complaints = input.complaints ?? [];
  if (input.cmd === "nearest") {
    const point = input.point ?? { lat: input.lat ?? 0, lng: input.lng ?? 0 };
    const nearest = districts
      .map((district) => ({
        district,
        distanceMeters: distanceMeters(point.lat, point.lng, district.lat, district.lng),
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
    if (!nearest) throw new Error("nearest requires at least one district");
    return {
      district: {
        id: nearest.district.id,
        name: nearest.district.name,
        lat: nearest.district.lat,
        lng: nearest.district.lng,
      },
      distanceMeters: nearest.distanceMeters,
    };
  }
  if (input.cmd === "topk") {
    return { topK: rank(districts, complaints, input.k ?? 5) };
  }
  if (input.cmd !== "analyze") throw new Error(`Unsupported engine command: ${input.cmd}`);

  const unique = deduplicate(complaints, input.duplicateRadiusMeters ?? 50);
  return {
    clusters: cluster(unique, input.radiusMeters ?? 1500, input.minPoints ?? 3),
    duplicatesRemoved: complaints.length - unique.length,
    uniqueComplaintCount: unique.length,
    topK: rank(districts, unique, input.k ?? 5),
  };
}
