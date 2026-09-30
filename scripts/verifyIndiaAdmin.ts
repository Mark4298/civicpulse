import { INDIA_ADMIN_DISTRICT_BY_ID, INDIA_ADMIN_STATES } from "../shared/data/indiaAdmin.js";
import { INDIA_SEED_DISTRICTS } from "../backend/src/services/districts.js";

const ids = INDIA_ADMIN_STATES.flatMap((state) => state.districts.map(({ id }) => id));
const frequencies = new Map<string, number>();
for (const id of ids) frequencies.set(id, (frequencies.get(id) ?? 0) + 1);
const duplicateIds = [...frequencies].filter(([, count]) => count > 1).map(([id]) => id);
const invalidIds = ids.filter(
  (id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*__[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
);
const missingSeedIds = INDIA_SEED_DISTRICTS.filter(
  ({ id }) => !INDIA_ADMIN_DISTRICT_BY_ID.has(id),
).map(({ id }) => id);
const districtCount = ids.length;
const stateCount = INDIA_ADMIN_STATES.filter(({ kind }) => kind === "state").length;
const unionTerritoryCount = INDIA_ADMIN_STATES.filter(
  ({ kind }) => kind === "union-territory",
).length;

console.info(`India states: ${stateCount}`);
console.info(`India union territories: ${unionTerritoryCount}`);
console.info(`India districts: ${districtCount}`);
for (const state of INDIA_ADMIN_STATES) {
  console.info(`${state.name}: ${state.districts.length}`);
}
console.info(`Duplicate district IDs: ${duplicateIds.length ? duplicateIds.join(", ") : "none"}`);
console.info(`Invalid district IDs: ${invalidIds.length ? invalidIds.join(", ") : "none"}`);
console.info(
  `Seed IDs missing from canonical data: ${missingSeedIds.length ? missingSeedIds.join(", ") : "none"}`,
);

if (
  stateCount !== 28 ||
  unionTerritoryCount !== 8 ||
  duplicateIds.length > 0 ||
  invalidIds.length > 0 ||
  missingSeedIds.length > 0
) {
  process.exitCode = 1;
}
