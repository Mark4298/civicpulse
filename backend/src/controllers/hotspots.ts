import type {
  ComplaintCategory,
  ComplaintLanguage,
  Hotspot,
  HotspotCluster,
  HotspotsResponse,
  StatsResponse,
} from "@civicpulse/shared";
import type { RequestHandler } from "express";
import { listDistricts } from "../services/districts.js";
import { runEngine } from "../services/engine.js";
import type { EngineOutput } from "../services/engineFallback.js";
import { recommendHotspots } from "../services/recommendations.js";
import { listComplaintsForAnalytics } from "../utils/complaintStore.js";
import { DEMO_HOTSPOTS, DEMO_STATS, shouldServeDemoAnalytics } from "../services/demoAnalytics.js";
import { hotspotsCache } from "../utils/ttlCache.js";
import { logger } from "../utils/logger.js";
import { sendJsonWithEtag } from "../utils/etag.js";
import { getAiHealthStatus } from "../services/gemini.js";

const categories: ComplaintCategory[] = [
  "roads",
  "water",
  "electricity",
  "sanitation",
  "healthcare",
  "internet",
  "drainage",
  "education",
  "transport",
  "safety",
  "other",
];

export const getAiHealth: RequestHandler = (_request, response) => {
  response.json(getAiHealthStatus());
};
const languages: ComplaintLanguage[] = [
  "en",
  "hi",
  "bn",
  "ta",
  "te",
  "mr",
  "gu",
  "kn",
  "ml",
  "pa",
  "pt",
  "ru",
];

interface ClusterAggregate {
  count: number;
  severitySum: number;
  categories: Map<ComplaintCategory, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHotspot(value: unknown): value is Omit<Hotspot, "recommendation"> {
  return (
    isRecord(value) &&
    typeof value.districtId === "string" &&
    typeof value.priorityScore === "number" &&
    categories.includes(value.topCategory as ComplaintCategory) &&
    typeof value.complaintCount === "number" &&
    typeof value.avgSeverity === "number"
  );
}

function isCluster(value: unknown): value is {
  clusterId: number;
  centroid: { lat: number; lng: number };
  memberCount: number;
} {
  if (!isRecord(value) || !isRecord(value.centroid)) return false;
  return (
    typeof value.clusterId === "number" &&
    typeof value.centroid.lat === "number" &&
    typeof value.centroid.lng === "number" &&
    typeof value.memberCount === "number"
  );
}

function distanceSquared(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const latitudeScale = Math.cos((lat1 * Math.PI) / 180);
  const dLat = lat1 - lat2;
  const dLng = (lng1 - lng2) * latitudeScale;
  return dLat * dLat + dLng * dLng;
}

// Aggregates complaints once, then associates each DBSCAN cluster to its nearest district in O(n + c*d).
function enrichClusters(
  rawClusters: Array<{
    clusterId: number;
    centroid: { lat: number; lng: number };
    memberCount: number;
  }>,
  complaints: Awaited<ReturnType<typeof listComplaintsForAnalytics>>,
  districts: Awaited<ReturnType<typeof listDistricts>>,
): HotspotCluster[] {
  const aggregates = new Map<string, ClusterAggregate>();
  for (const complaint of complaints) {
    const aggregate = aggregates.get(complaint.districtId) ?? {
      count: 0,
      severitySum: 0,
      categories: new Map<ComplaintCategory, number>(),
    };
    aggregate.count += 1;
    aggregate.severitySum += complaint.severity;
    aggregate.categories.set(
      complaint.category,
      (aggregate.categories.get(complaint.category) ?? 0) + 1,
    );
    aggregates.set(complaint.districtId, aggregate);
  }

  return rawClusters.flatMap((cluster) => {
    let nearest = districts[0];
    if (!nearest) return [];
    let nearestDistance = distanceSquared(
      cluster.centroid.lat,
      cluster.centroid.lng,
      nearest.lat,
      nearest.lng,
    );
    for (const district of districts.slice(1)) {
      const distance = distanceSquared(
        cluster.centroid.lat,
        cluster.centroid.lng,
        district.lat,
        district.lng,
      );
      if (distance < nearestDistance) {
        nearest = district;
        nearestDistance = distance;
      }
    }
    const aggregate = aggregates.get(nearest.id);
    if (!aggregate) return [];
    const avgSeverity = aggregate.severitySum / aggregate.count;
    const topCategory = [...aggregate.categories.entries()].sort(
      ([leftCategory, leftCount], [rightCategory, rightCount]) =>
        rightCount - leftCount || leftCategory.localeCompare(rightCategory),
    )[0]?.[0];
    if (!topCategory) return [];
    return [
      {
        ...cluster,
        districtId: nearest.id,
        districtName: nearest.name,
        country: nearest.country,
        priorityScore: (aggregate.count * avgSeverity) / Math.max(nearest.infraScore, 1),
        avgSeverity,
        topCategory,
      },
    ];
  });
}

async function loadHotspots(): Promise<HotspotsResponse> {
  const cached = hotspotsCache.get();
  if (cached) return cached;

  const [complaints, districts] = await Promise.all([
    listComplaintsForAnalytics(),
    listDistricts(),
  ]);
  const result: EngineOutput = await runEngine({ cmd: "analyze", complaints, districts, k: 5 });
  if (!Array.isArray(result.topK) || !result.topK.every(isHotspot)) {
    throw new Error("Analytics engine returned an invalid Top-K response");
  }
  if (!Array.isArray(result.clusters) || !result.clusters.every(isCluster)) {
    throw new Error("Analytics engine returned invalid DBSCAN clusters");
  }
  const districtsById = new Map(districts.map((district) => [district.id, district]));
  const topFive: Array<Omit<Hotspot, "recommendation">> = result.topK.map((item) => ({
    districtId: item.districtId,
    districtName: districtsById.get(item.districtId)?.name ?? item.districtId,
    country: districtsById.get(item.districtId)?.country ?? "Unknown",
    lat: districtsById.get(item.districtId)?.lat ?? 0,
    lng: districtsById.get(item.districtId)?.lng ?? 0,
    priorityScore: item.priorityScore,
    topCategory: item.topCategory,
    complaintCount: item.complaintCount,
    avgSeverity: item.avgSeverity,
  }));
  const withRecommendations = await recommendHotspots(topFive);
  const clusters = enrichClusters(result.clusters, complaints, districts);
  const response: HotspotsResponse = { hotspots: withRecommendations, clusters };
  hotspotsCache.set(response);
  return response;
}

export const getHotspots: RequestHandler = async (request, response, next) => {
  try {
    if (await shouldServeDemoAnalytics()) {
      sendJsonWithEtag(request, response, DEMO_HOTSPOTS);
      return;
    }
    sendJsonWithEtag(request, response, await loadHotspots());
  } catch (error) {
    logger.error("Could not compute hotspots", error);
    next(error);
  }
};

// Counts complaints and unique district IDs in one pass, O(n).
export const getStats: RequestHandler = async (request, response, next) => {
  try {
    if (await shouldServeDemoAnalytics()) {
      sendJsonWithEtag(request, response, DEMO_STATS);
      return;
    }
    const complaints = await listComplaintsForAnalytics();
    const districts = await listDistricts();
    const countries: Record<string, number> = {};
    const districtsById = new Map(districts.map((district) => [district.id, district]));
    const languageCounts: Record<ComplaintLanguage, number> = {
      en: 0,
      hi: 0,
      bn: 0,
      ta: 0,
      te: 0,
      mr: 0,
      gu: 0,
      kn: 0,
      ml: 0,
      pa: 0,
      or: 0,
      "hi-Latn": 0,
      pt: 0,
      ru: 0,
    };
    const categoryCounts: Record<ComplaintCategory, number> = {
      roads: 0,
      water: 0,
      electricity: 0,
      sanitation: 0,
      healthcare: 0,
      internet: 0,
      drainage: 0,
      education: 0,
      transport: 0,
      safety: 0,
      other: 0,
    };
    const coveredDistricts = new Set<string>();
    for (const complaint of complaints) {
      if (languages.includes(complaint.detectedLanguage))
        languageCounts[complaint.detectedLanguage] += 1;
      if (categories.includes(complaint.category)) categoryCounts[complaint.category] += 1;
      coveredDistricts.add(complaint.districtId);
      const country = districtsById.get(complaint.districtId)?.country ?? "Unknown";
      countries[country] = (countries[country] ?? 0) + 1;
    }
    const stats: StatsResponse = {
      totalComplaints: complaints.length,
      languages: languageCounts,
      categories: categoryCounts,
      countries,
      districtsCovered: coveredDistricts.size,
    };
    sendJsonWithEtag(request, response, stats);
  } catch (error) {
    logger.error("Could not compute statistics", error);
    next(error);
  }
};
