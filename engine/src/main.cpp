#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>
#include <queue>
#include <random>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#if defined(__GNUC__) && !defined(__clang__) && __GNUC__ < 7
#define JSON_HAS_CPP_14
#endif
#include "../include/nlohmann/json.hpp"

namespace civicpulse {

using json = nlohmann::json;
constexpr double kEarthRadiusMeters = 6371008.8;
constexpr double kPi = 3.14159265358979323846;

struct Complaint {
  std::string id;
  std::string category;
  std::string districtId;
  double lat{};
  double lng{};
  double severity{};
};

struct District {
  std::string id;
  std::string name;
  double lat{};
  double lng{};
  double infraScore{1.0};
};

struct Vec3 {
  double x{};
  double y{};
  double z{};
};

struct GridKey {
  std::int64_t x{};
  std::int64_t y{};
  std::int64_t z{};

  bool operator==(const GridKey& other) const noexcept {
    return x == other.x && y == other.y && z == other.z;
  }
};

struct GridKeyHash {
  std::size_t operator()(const GridKey& key) const noexcept {
    const auto mix = [](std::uint64_t value) {
      value ^= value >> 30U;
      value *= 0xbf58476d1ce4e5b9ULL;
      value ^= value >> 27U;
      value *= 0x94d049bb133111ebULL;
      return value ^ (value >> 31U);
    };
    const auto hx = mix(static_cast<std::uint64_t>(key.x));
    const auto hy = mix(static_cast<std::uint64_t>(key.y));
    const auto hz = mix(static_cast<std::uint64_t>(key.z));
    return static_cast<std::size_t>(hx ^ (hy << 1U) ^ (hz << 7U));
  }
};

struct PriorityDistrict {
  std::string districtId;
  std::string districtName;
  double priorityScore{};
  double avgSeverity{};
  std::size_t complaintCount{};
  std::string topCategory;
  json categoryFrequency = json::object();
};

double radians(double degrees) { return degrees * kPi / 180.0; }

Vec3 toEcef(double lat, double lng) {
  const double latitude = radians(lat);
  const double longitude = radians(lng);
  const double cosLatitude = std::cos(latitude);
  return {cosLatitude * std::cos(longitude), cosLatitude * std::sin(longitude),
          std::sin(latitude)};
}

double squaredDistance(const Vec3& lhs, const Vec3& rhs) {
  const double dx = lhs.x - rhs.x;
  const double dy = lhs.y - rhs.y;
  const double dz = lhs.z - rhs.z;
  return dx * dx + dy * dy + dz * dz;
}

double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
  const double dLat = radians(lat2 - lat1);
  const double dLng = radians(lng2 - lng1);
  const double sinLat = std::sin(dLat / 2.0);
  const double sinLng = std::sin(dLng / 2.0);
  const double value = sinLat * sinLat + std::cos(radians(lat1)) *
      std::cos(radians(lat2)) * sinLng * sinLng;
  return 2.0 * kEarthRadiusMeters * std::asin(std::sqrt(std::max(0.0, std::min(value, 1.0))));
}

GridKey gridKey(const Vec3& point, double cellSize) {
  return {static_cast<std::int64_t>(std::floor(point.x / cellSize)),
          static_cast<std::int64_t>(std::floor(point.y / cellSize)),
          static_cast<std::int64_t>(std::floor(point.z / cellSize))};
}

// Expected O(1) insertion and O(1) local-candidate lookup per point for a fixed-radius 3D grid.
class SpatialGrid {
 public:
  explicit SpatialGrid(double radiusMeters)
      : cellSize_(2.0 * std::sin(std::min(radiusMeters / kEarthRadiusMeters, kPi) / 2.0)) {}

  void insert(const Vec3& point, std::size_t index) {
    cells_[gridKey(point, cellSize_)].push_back(index);
  }

  // Expected O(1 + c), where c is the number of points in 27 neighboring grid cells.
  std::vector<std::size_t> candidates(const Vec3& point) const {
    std::vector<std::size_t> result;
    const GridKey center = gridKey(point, cellSize_);
    for (std::int64_t dx = -1; dx <= 1; ++dx) {
      for (std::int64_t dy = -1; dy <= 1; ++dy) {
        for (std::int64_t dz = -1; dz <= 1; ++dz) {
          const auto found = cells_.find({center.x + dx, center.y + dy, center.z + dz});
          if (found != cells_.end()) {
            result.insert(result.end(), found->second.begin(), found->second.end());
          }
        }
      }
    }
    return result;
  }

 private:
  double cellSize_;
  std::unordered_map<GridKey, std::vector<std::size_t>, GridKeyHash> cells_;
};

// Expected near O(n + candidate pairs) with spatially distributed points; dense cells can be quadratic.
std::vector<json> clusterDbscan(const std::vector<Complaint>& complaints, double radiusMeters,
                                std::size_t minPoints) {
  if (radiusMeters <= 0.0 || minPoints == 0) {
    throw std::invalid_argument("DBSCAN radius and minPoints must be positive");
  }
  const std::size_t count = complaints.size();
  std::vector<Vec3> points;
  points.reserve(count);
  SpatialGrid grid(radiusMeters);
  for (std::size_t i = 0; i < count; ++i) {
    points.push_back(toEcef(complaints[i].lat, complaints[i].lng));
    grid.insert(points.back(), i);
  }

  constexpr int unvisited = -2;
  constexpr int noise = -1;
  std::vector<int> labels(count, unvisited);
  std::vector<int> queuedInCluster(count, -1);
  int clusterId = 0;
  const double chordRadius = 2.0 * std::sin(std::min(radiusMeters / kEarthRadiusMeters, kPi) / 2.0);
  const double chordRadiusSquared = chordRadius * chordRadius;

  for (std::size_t seed = 0; seed < count; ++seed) {
    if (labels[seed] != unvisited) continue;
    std::vector<std::size_t> neighbors;
    for (const auto candidate : grid.candidates(points[seed])) {
      if (squaredDistance(points[seed], points[candidate]) <= chordRadiusSquared) {
        neighbors.push_back(candidate);
      }
    }
    if (neighbors.size() < minPoints) {
      labels[seed] = noise;
      continue;
    }

    labels[seed] = clusterId;
    std::vector<std::size_t> queue;
    queue.reserve(neighbors.size());
    for (const auto neighbor : neighbors) {
      if (neighbor != seed && queuedInCluster[neighbor] != clusterId) {
        queuedInCluster[neighbor] = clusterId;
        queue.push_back(neighbor);
      }
    }
    for (std::size_t cursor = 0; cursor < queue.size(); ++cursor) {
      const std::size_t current = queue[cursor];
      if (labels[current] == noise) labels[current] = clusterId;
      if (labels[current] != unvisited) continue;
      labels[current] = clusterId;

      std::vector<std::size_t> nearby;
      for (const auto candidate : grid.candidates(points[current])) {
        if (squaredDistance(points[current], points[candidate]) <= chordRadiusSquared) {
          nearby.push_back(candidate);
        }
      }
      if (nearby.size() >= minPoints) {
        for (const auto neighbor : nearby) {
          if (labels[neighbor] == noise) labels[neighbor] = clusterId;
          if (labels[neighbor] == unvisited && queuedInCluster[neighbor] != clusterId) {
            queuedInCluster[neighbor] = clusterId;
            queue.push_back(neighbor);
          }
        }
      }
    }
    ++clusterId;
  }

  struct Centroid {
    double latSum{};
    double lngSum{};
    std::size_t members{};
  };
  std::vector<Centroid> centroids(static_cast<std::size_t>(clusterId));
  for (std::size_t i = 0; i < count; ++i) {
    if (labels[i] >= 0) {
      auto& centroid = centroids[static_cast<std::size_t>(labels[i])];
      centroid.latSum += complaints[i].lat;
      centroid.lngSum += complaints[i].lng;
      ++centroid.members;
    }
  }

  std::vector<json> result;
  result.reserve(centroids.size());
  for (std::size_t id = 0; id < centroids.size(); ++id) {
    const auto& centroid = centroids[id];
    result.push_back({{"clusterId", id},
                      {"centroid", {{"lat", centroid.latSum / centroid.members},
                                     {"lng", centroid.lngSum / centroid.members}}},
                      {"memberCount", centroid.members}});
  }
  return result;
}

// Builds a balanced 3D KD-tree in average O(n log n) using median selection at each level.
class DistrictKdTree {
  struct Node {
    std::size_t districtIndex{};
    int axis{};
    int left{-1};
    int right{-1};
  };

 public:
  explicit DistrictKdTree(const std::vector<District>& districts) : districts_(districts) {
    std::vector<std::size_t> indices(districts.size());
    indices.reserve(districts.size());
    for (std::size_t i = 0; i < indices.size(); ++i) indices[i] = i;
    nodes_.reserve(indices.size());
    root_ = build(indices, 0, indices.size(), 0);
  }

  // Average O(log n) query on a balanced tree; exact result distance is compared with haversine.
  std::pair<std::size_t, double> nearest(double lat, double lng) const {
    if (root_ < 0) throw std::invalid_argument("nearest requires at least one district");
    const Vec3 target = toEcef(lat, lng);
    std::size_t best = nodes_[static_cast<std::size_t>(root_)].districtIndex;
    double bestChordSquared = squaredDistance(target, toEcef(districts_[best].lat, districts_[best].lng));
    nearestRecursive(root_, target, best, bestChordSquared);
    return {best, haversineMeters(lat, lng, districts_[best].lat, districts_[best].lng)};
  }

 private:
  double coordinate(std::size_t districtIndex, int axis) const {
    const Vec3 point = toEcef(districts_[districtIndex].lat, districts_[districtIndex].lng);
    if (axis == 0) return point.x;
    if (axis == 1) return point.y;
    return point.z;
  }

  // Each level partitions its range once; summed median-selection work is average O(n log n).
  int build(std::vector<std::size_t>& indices, std::size_t begin, std::size_t end, int axis) {
    if (begin >= end) return -1;
    const std::size_t middle = begin + (end - begin) / 2;
    std::nth_element(indices.begin() + static_cast<std::ptrdiff_t>(begin),
                     indices.begin() + static_cast<std::ptrdiff_t>(middle),
                     indices.begin() + static_cast<std::ptrdiff_t>(end),
                     [this, axis](std::size_t lhs, std::size_t rhs) {
                       return coordinate(lhs, axis) < coordinate(rhs, axis);
                     });
    const int nodeIndex = static_cast<int>(nodes_.size());
    nodes_.push_back({indices[middle], axis, -1, -1});
    const int nextAxis = (axis + 1) % 3;
    const int left = build(indices, begin, middle, nextAxis);
    const int right = build(indices, middle + 1, end, nextAxis);
    nodes_[static_cast<std::size_t>(nodeIndex)].left = left;
    nodes_[static_cast<std::size_t>(nodeIndex)].right = right;
    return nodeIndex;
  }

  // Average O(log n); pruning compares a KD split-plane lower bound in the same spherical chord space.
  void nearestRecursive(int nodeIndex, const Vec3& target, std::size_t& best,
                        double& bestChordSquared) const {
    if (nodeIndex < 0) return;
    const Node& node = nodes_[static_cast<std::size_t>(nodeIndex)];
    const District& district = districts_[node.districtIndex];
    const Vec3 point = toEcef(district.lat, district.lng);
    const double distanceSquared = squaredDistance(target, point);
    if (distanceSquared < bestChordSquared) {
      best = node.districtIndex;
      bestChordSquared = distanceSquared;
    }

    const double targetCoordinate = node.axis == 0 ? target.x : node.axis == 1 ? target.y : target.z;
    const double split = targetCoordinate - coordinate(node.districtIndex, node.axis);
    const int nearBranch = split < 0.0 ? node.left : node.right;
    const int farBranch = split < 0.0 ? node.right : node.left;
    nearestRecursive(nearBranch, target, best, bestChordSquared);
    if (split * split <= bestChordSquared) nearestRecursive(farBranch, target, best, bestChordSquared);
  }

  const std::vector<District>& districts_;
  std::vector<Node> nodes_;
  int root_{-1};
};

// Union-Find operations are amortized O(alpha(n)) with path compression and union by rank.
class DisjointSet {
 public:
  explicit DisjointSet(std::size_t size) : parent_(size), rank_(size, 0) {
    for (std::size_t i = 0; i < size; ++i) parent_[i] = i;
  }

  std::size_t find(std::size_t item) {
    if (parent_[item] != item) parent_[item] = find(parent_[item]);
    return parent_[item];
  }

  void unite(std::size_t lhs, std::size_t rhs) {
    lhs = find(lhs);
    rhs = find(rhs);
    if (lhs == rhs) return;
    if (rank_[lhs] < rank_[rhs]) std::swap(lhs, rhs);
    parent_[rhs] = lhs;
    if (rank_[lhs] == rank_[rhs]) ++rank_[lhs];
  }

 private:
  std::vector<std::size_t> parent_;
  std::vector<unsigned char> rank_;
};

// Expected O(n + candidate pairs) using a spatial grid; candidate comparisons use haversine distance.
std::vector<Complaint> deduplicate(const std::vector<Complaint>& complaints, double radiusMeters) {
  if (radiusMeters < 0.0) throw std::invalid_argument("duplicate radius cannot be negative");
  if (radiusMeters == 0.0 || complaints.empty()) return complaints;
  SpatialGrid grid(radiusMeters);
  DisjointSet sets(complaints.size());
  std::vector<Vec3> points;
  points.reserve(complaints.size());
  for (const auto& complaint : complaints) points.push_back(toEcef(complaint.lat, complaint.lng));
  for (std::size_t i = 0; i < complaints.size(); ++i) {
    for (const auto candidate : grid.candidates(points[i])) {
      if (complaints[i].category == complaints[candidate].category &&
          haversineMeters(complaints[i].lat, complaints[i].lng,
                          complaints[candidate].lat, complaints[candidate].lng) <= radiusMeters) {
        sets.unite(i, candidate);
      }
    }
    grid.insert(points[i], i);
  }

  std::unordered_map<std::size_t, std::size_t> representative;
  representative.reserve(complaints.size());
  std::vector<Complaint> unique;
  unique.reserve(complaints.size());
  for (std::size_t i = 0; i < complaints.size(); ++i) {
    const std::size_t root = sets.find(i);
    if (representative.emplace(root, i).second) unique.push_back(complaints[i]);
  }
  return unique;
}

struct Aggregate {
  std::size_t count{};
  double severitySum{};
  std::unordered_map<std::string, std::size_t> categories;
};

// O(n) expected hash-map aggregation over complaints and their category frequencies.
std::unordered_map<std::string, Aggregate> aggregateByDistrict(
    const std::vector<Complaint>& complaints) {
  std::unordered_map<std::string, Aggregate> aggregates;
  aggregates.reserve(complaints.size());
  for (const auto& complaint : complaints) {
    auto& aggregate = aggregates[complaint.districtId];
    ++aggregate.count;
    aggregate.severitySum += complaint.severity;
    ++aggregate.categories[complaint.category];
  }
  return aggregates;
}

// O(n log K) priority selection using a size-K min-heap.
std::vector<PriorityDistrict> topK(const std::vector<District>& districts,
                                   const std::unordered_map<std::string, Aggregate>& aggregates,
                                   std::size_t k) {
  const auto lowerPriority = [](const PriorityDistrict& lhs, const PriorityDistrict& rhs) {
    if (lhs.priorityScore != rhs.priorityScore) return lhs.priorityScore > rhs.priorityScore;
    return lhs.districtId < rhs.districtId;
  };
  std::priority_queue<PriorityDistrict, std::vector<PriorityDistrict>, decltype(lowerPriority)> heap(lowerPriority);

  for (const auto& district : districts) {
    const auto found = aggregates.find(district.id);
    if (found == aggregates.end() || found->second.count == 0 || k == 0) continue;
    const Aggregate& aggregate = found->second;
    const double average = aggregate.severitySum / static_cast<double>(aggregate.count);
    const double score = static_cast<double>(aggregate.count) * average /
                         std::max(district.infraScore, 1.0);
    std::string topCategory;
    std::size_t topCount = 0;
    json frequencies = json::object();
    for (const auto& categoryFrequency : aggregate.categories) {
      const auto& category = categoryFrequency.first;
      const std::size_t frequency = categoryFrequency.second;
      frequencies[category] = frequency;
      if (frequency > topCount || (frequency == topCount && category < topCategory)) {
        topCategory = category;
        topCount = frequency;
      }
    }
    PriorityDistrict candidate{district.id, district.name, score, average,
                               aggregate.count, topCategory, std::move(frequencies)};
    if (heap.size() < k) {
      heap.push(std::move(candidate));
    } else if (candidate.priorityScore > heap.top().priorityScore ||
           (candidate.priorityScore == heap.top().priorityScore &&
          candidate.districtId < heap.top().districtId)) {
      heap.pop();
      heap.push(std::move(candidate));
    }
  }

  std::vector<PriorityDistrict> result;
  result.reserve(heap.size());
  while (!heap.empty()) {
    result.push_back(heap.top());
    heap.pop();
  }
  std::sort(result.begin(), result.end(), [](const auto& lhs, const auto& rhs) {
    if (lhs.priorityScore != rhs.priorityScore) return lhs.priorityScore > rhs.priorityScore;
    return lhs.districtId < rhs.districtId;
  });
  return result;
}

std::vector<Complaint> parseComplaints(const json& input) {
  std::vector<Complaint> complaints;
  complaints.reserve(input.size());
  for (const auto& item : input) {
    complaints.push_back({item.value("id", std::string{}), item.value("category", std::string{}),
                          item.value("districtId", std::string{}), item.at("lat").get<double>(),
                          item.at("lng").get<double>(), item.at("severity").get<double>()});
  }
  return complaints;
}

std::vector<District> parseDistricts(const json& input) {
  std::vector<District> districts;
  districts.reserve(input.size());
  for (const auto& item : input) {
    districts.push_back({item.value("id", std::string{}), item.value("name", std::string{}),
                         item.at("lat").get<double>(), item.at("lng").get<double>(),
                         item.value("infraScore", 1.0)});
  }
  return districts;
}

json priorityJson(const PriorityDistrict& item) {
  return {{"districtId", item.districtId}, {"districtName", item.districtName},
          {"priorityScore", item.priorityScore}, {"avgSeverity", item.avgSeverity},
          {"complaintCount", item.complaintCount}, {"topCategory", item.topCategory},
          {"categoryFrequency", item.categoryFrequency}};
}

// Command orchestration is linear apart from the documented algorithm calls below.
json runCommand(const json& request) {
  const std::string command = request.at("cmd").get<std::string>();
  const auto districts = parseDistricts(request.value("districts", json::array()));
  if (command == "nearest") {
    DistrictKdTree tree(districts);
    const double lat = request.contains("point") ? request.at("point").at("lat").get<double>()
                                                   : request.at("lat").get<double>();
    const double lng = request.contains("point") ? request.at("point").at("lng").get<double>()
                                                   : request.at("lng").get<double>();
    const auto nearest = tree.nearest(lat, lng);
    const std::size_t index = nearest.first;
    return {{"district", {{"id", districts[index].id}, {"name", districts[index].name},
                 {"lat", districts[index].lat}, {"lng", districts[index].lng}}},
        {"distanceMeters", nearest.second}};
  }

  const auto complaints = parseComplaints(request.value("complaints", json::array()));
  if (command == "topk") {
    const auto aggregates = aggregateByDistrict(complaints);
    const auto result = topK(districts, aggregates, request.value("k", std::size_t{5}));
    json output = json::array();
    for (const auto& item : result) output.push_back(priorityJson(item));
    return {{"topK", std::move(output)}};
  }
  if (command != "analyze") throw std::invalid_argument("cmd must be analyze, nearest, or topk");

  const auto unique = deduplicate(complaints, request.value("duplicateRadiusMeters", 50.0));
  const auto clusters = clusterDbscan(unique, request.value("radiusMeters", 1500.0),
                                      request.value("minPoints", std::size_t{3}));
  const auto aggregates = aggregateByDistrict(unique);
  const auto priorities = topK(districts, aggregates, request.value("k", std::size_t{5}));
  json top = json::array();
  for (const auto& item : priorities) top.push_back(priorityJson(item));
  return {{"clusters", clusters}, {"duplicatesRemoved", complaints.size() - unique.size()},
          {"uniqueComplaintCount", unique.size()}, {"topK", std::move(top)}};
}

json benchmark() {
  constexpr std::size_t count = 100000;
  std::mt19937_64 random(0xC1A1C5EULL);
  std::uniform_real_distribution<double> latitudes(-55.0, 70.0);
  std::uniform_real_distribution<double> longitudes(-170.0, 170.0);
  const std::array<std::string, 6> categories = {"roads", "water", "electricity", "sanitation",
                                                  "healthcare", "internet"};
  std::vector<Complaint> complaints;
  complaints.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    complaints.push_back({std::to_string(i), categories[i % categories.size()],
                          "district-" + std::to_string(i % 100), latitudes(random),
                          longitudes(random), static_cast<double>((i % 5) + 1)});
  }
  std::vector<District> districts;
  districts.reserve(100);
  for (std::size_t i = 0; i < 100; ++i) {
    districts.push_back({"district-" + std::to_string(i), "District " + std::to_string(i),
                         latitudes(random), longitudes(random), 1.0 + static_cast<double>(i % 10)});
  }

  const auto start = std::chrono::steady_clock::now();
  const auto unique = deduplicate(complaints, 50.0);
  const auto clusters = clusterDbscan(unique, 500.0, 4);
  const auto aggregates = aggregateByDistrict(unique);
  const auto priorities = topK(districts, aggregates, 10);
  const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - start);
  return {{"complaints", count}, {"uniqueComplaints", unique.size()},
          {"clusters", clusters.size()}, {"topK", priorities.size()},
          {"elapsedMs", elapsed.count()}};
}

}  // namespace civicpulse

#ifndef CIVICPULSE_TEST
int main(int argc, char** argv) {
  try {
    if (argc > 1 && std::string(argv[1]) == "--bench") {
      std::cout << civicpulse::benchmark().dump() << '\n';
      return 0;
    }
    civicpulse::json request;
    std::cin >> request;
    std::cout << civicpulse::runCommand(request).dump() << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cout << civicpulse::json{{"error", error.what()}}.dump() << '\n';
    return 1;
  }
}
#endif