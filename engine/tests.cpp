#define CIVICPULSE_TEST
#include <cassert>

#include "src/main.cpp"

int main() {
  using namespace civicpulse;

  const std::vector<District> districts = {
      {"north", "North", 28.6139, 77.2090, 2.0},
      {"south", "South", 12.9716, 77.5946, 8.0},
      {"east", "East", 22.5726, 88.3639, 4.0},
  };
  const std::vector<Complaint> complaints = {
      {"c1", "roads", "north", 28.61390, 77.20900, 5.0},
      {"c2", "roads", "north", 28.61400, 77.20910, 3.0},
      {"c3", "water", "north", 28.61390, 77.20900, 4.0},
      {"c4", "water", "south", 12.97160, 77.59460, 2.0},
  };

  const auto clusters = clusterDbscan(complaints, 50.0, 2);
  assert(clusters.size() == 1);
  assert(clusters[0].at("memberCount").get<std::size_t>() == 3);
  assert(std::abs(clusters[0].at("centroid").at("lat").get<double>() - 28.6139333333) < 0.00001);

  const std::vector<Complaint> borderCase = {
      {"border", "roads", "north", 28.61390, 77.20900, 2.0},
      {"core1", "roads", "north", 28.61420, 77.20900, 2.0},
      {"core2", "roads", "north", 28.61421, 77.20900, 2.0},
      {"core3", "roads", "north", 28.61422, 77.20900, 2.0},
  };
  const auto borderClusters = clusterDbscan(borderCase, 40.0, 3);
  assert(borderClusters.size() == 1);
  assert(borderClusters[0].at("memberCount").get<std::size_t>() == 4);

  const auto unique = deduplicate(complaints, 30.0);
  assert(unique.size() == 3);
  assert(unique[0].id == "c1");

  DistrictKdTree tree(districts);
  const auto nearest = tree.nearest(28.6140, 77.2090);
  assert(districts[nearest.first].id == "north");
  assert(nearest.second < 20.0);

  const auto aggregates = aggregateByDistrict(complaints);
  assert(aggregates.at("north").count == 3);
  assert(aggregates.at("north").severitySum == 12.0);
  assert(aggregates.at("north").categories.at("roads") == 2);
  const auto priorities = topK(districts, aggregates, 1);
  assert(priorities.size() == 1);
  assert(priorities[0].districtId == "north");
  assert(priorities[0].priorityScore == 6.0);
  const std::vector<District> lowThenHigh = {districts[1], districts[0]};
  const auto replacement = topK(lowThenHigh, aggregates, 1);
  assert(replacement.size() == 1);
  assert(replacement[0].districtId == "north");

  const json nearestRequest = {
      {"cmd", "nearest"},
      {"districts", {{{"id", "north"}, {"name", "North"}, {"lat", 28.6139},
                      {"lng", 77.2090}, {"infraScore", 2}}}},
      {"point", {{"lat", 28.6140}, {"lng", 77.2090}}},
  };
  assert(runCommand(nearestRequest).at("district").at("id") == "north");

  std::cout << "CivicPulse engine sanity tests passed.\n";
  return 0;
}