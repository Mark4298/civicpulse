import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { District } from "@civicpulse/shared";
import {
  INDIA_ADMIN_DISTRICT_BY_ID,
  INDIA_ADMIN_DISTRICT_BY_STATE_AND_NAME,
  INDIA_ADMIN_STATES,
  INDIA_ADMIN_STATE_BY_ID,
} from "@civicpulse/shared";
import { getDb } from "../config/firebase.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/timeout.js";

let cachedDistricts: District[] | undefined;

interface NominatimAddress {
  country_code?: unknown;
  state?: unknown;
  state_district?: unknown;
  district?: unknown;
  county?: unknown;
  city_district?: unknown;
  municipality?: unknown;
  city?: unknown;
  town?: unknown;
}

let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequestAt = 0;

function normalizeAdminName(value: string): string {
  return value.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchNominatim(lat: number, lng: number): Promise<Response> {
  const result = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastNominatimRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastNominatimRequestAt = Date.now();
    const query = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "10",
      addressdetails: "1",
    });
    return fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
      headers: {
        "User-Agent": "CivicPulse/1.0",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(6000),
    });
  });
  nominatimQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function suggestIndiaDistrictForLocation(
  lat: number,
  lng: number,
): Promise<District | null> {
  try {
    const response = await fetchNominatim(lat, lng);
    if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
    const result: unknown = await response.json();
    if (!isRecord(result) || !isRecord(result.address)) return null;
    const address = result.address as NominatimAddress;
    if (address.country_code !== "in" || typeof address.state !== "string") return null;

    const stateAliases: Record<string, string> = {
      "national capital territory of delhi": "delhi",
      "nct of delhi": "delhi",
      orissa: "odisha",
      pondicherry: "puducherry",
    };
    const rawState = normalizeAdminName(address.state);
    const stateKey = stateAliases[rawState] ?? rawState;
    const adminState = INDIA_ADMIN_STATES.find(
      (state) => normalizeAdminName(state.name) === stateKey,
    );
    if (!adminState) return null;

    const rawDistricts = [
      address.state_district,
      address.district,
      address.county,
      address.city_district,
      address.municipality,
      address.city,
      address.town,
    ].filter((name): name is string => typeof name === "string");
    for (const rawDistrict of rawDistricts) {
      const districtKey = normalizeAdminName(rawDistrict).replace(/\s+district$/, "");
      const district = adminState.districts.find(
        (candidate) =>
          normalizeAdminName(candidate.name).replace(/\s+district$/, "") === districtKey,
      );
      if (district) {
        return {
          id: district.id,
          name: district.name,
          country: "India",
          state: adminState.name,
          lat,
          lng,
          infraScore: 5,
          population: null,
        };
      }
    }
    return null;
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    logger.warn(`Nominatim reverse geocoding failed (${errorClass}); keep manual selection`);
    return null;
  }
}

export const INDIA_SEED_DISTRICTS: District[] = [
  {
    id: "rajasthan__jaipur",
    name: "Jaipur",
    country: "India",
    state: "Rajasthan",
    lat: 26.9124,
    lng: 75.7873,
    population: 6_626_178,
    infraScore: 6.4,
  },
  {
    id: "rajasthan__jodhpur",
    name: "Jodhpur",
    country: "India",
    state: "Rajasthan",
    lat: 26.2389,
    lng: 73.0243,
    population: 3_687_165,
    infraScore: 5.9,
  },
  {
    id: "rajasthan__udaipur",
    name: "Udaipur",
    country: "India",
    state: "Rajasthan",
    lat: 24.5854,
    lng: 73.7125,
    population: 3_068_420,
    infraScore: 6.2,
  },
  {
    id: "maharashtra__pune",
    name: "Pune",
    country: "India",
    state: "Maharashtra",
    lat: 18.5204,
    lng: 73.8567,
    population: 9_429_408,
    infraScore: 7.2,
  },
  {
    id: "maharashtra__mumbai-suburban",
    name: "Mumbai Suburban",
    country: "India",
    state: "Maharashtra",
    lat: 19.153,
    lng: 72.875,
    population: 9_356_962,
    infraScore: 7.4,
  },
  {
    id: "maharashtra__nagpur",
    name: "Nagpur",
    country: "India",
    state: "Maharashtra",
    lat: 21.1458,
    lng: 79.0882,
    population: 4_653_570,
    infraScore: 6.6,
  },
  {
    id: "uttar-pradesh__lucknow",
    name: "Lucknow",
    country: "India",
    state: "Uttar Pradesh",
    lat: 26.8467,
    lng: 80.9462,
    population: 4_589_838,
    infraScore: 6.1,
  },
  {
    id: "uttar-pradesh__varanasi",
    name: "Varanasi",
    country: "India",
    state: "Uttar Pradesh",
    lat: 25.3176,
    lng: 82.9739,
    population: 3_676_841,
    infraScore: 5.8,
  },
  {
    id: "uttar-pradesh__kanpur-nagar",
    name: "Kanpur Nagar",
    country: "India",
    state: "Uttar Pradesh",
    lat: 26.4499,
    lng: 80.3319,
    population: 4_581_268,
    infraScore: 5.7,
  },
  {
    id: "bihar__patna",
    name: "Patna",
    country: "India",
    state: "Bihar",
    lat: 25.5941,
    lng: 85.1376,
    population: 5_838_465,
    infraScore: 5.6,
  },
  {
    id: "bihar__gaya",
    name: "Gaya",
    country: "India",
    state: "Bihar",
    lat: 24.7914,
    lng: 85.0002,
    population: 4_391_418,
    infraScore: 5.3,
  },
  {
    id: "west-bengal__kolkata",
    name: "Kolkata",
    country: "India",
    state: "West Bengal",
    lat: 22.5726,
    lng: 88.3639,
    population: 4_496_694,
    infraScore: 7.1,
  },
  {
    id: "west-bengal__darjeeling",
    name: "Darjeeling",
    country: "India",
    state: "West Bengal",
    lat: 27.036,
    lng: 88.2627,
    population: 1_846_823,
    infraScore: 6.3,
  },
  {
    id: "tamil-nadu__chennai",
    name: "Chennai",
    country: "India",
    state: "Tamil Nadu",
    lat: 13.0827,
    lng: 80.2707,
    population: 4_646_732,
    infraScore: 7.3,
  },
  {
    id: "tamil-nadu__madurai",
    name: "Madurai",
    country: "India",
    state: "Tamil Nadu",
    lat: 9.9252,
    lng: 78.1198,
    population: 3_038_252,
    infraScore: 6.2,
  },
  {
    id: "tamil-nadu__coimbatore",
    name: "Coimbatore",
    country: "India",
    state: "Tamil Nadu",
    lat: 11.0168,
    lng: 76.9558,
    population: 3_458_045,
    infraScore: 7.1,
  },
  {
    id: "kerala__ernakulam",
    name: "Ernakulam (Kochi)",
    country: "India",
    state: "Kerala",
    lat: 9.9312,
    lng: 76.2673,
    population: 3_282_388,
    infraScore: 7.6,
  },
  {
    id: "kerala__thiruvananthapuram",
    name: "Thiruvananthapuram",
    country: "India",
    state: "Kerala",
    lat: 8.5241,
    lng: 76.9366,
    population: 3_301_427,
    infraScore: 7.5,
  },
  {
    id: "karnataka__bengaluru-urban",
    name: "Bengaluru Urban",
    country: "India",
    state: "Karnataka",
    lat: 12.9716,
    lng: 77.5946,
    population: 9_621_551,
    infraScore: 7.4,
  },
  {
    id: "karnataka__mysuru",
    name: "Mysuru",
    country: "India",
    state: "Karnataka",
    lat: 12.2958,
    lng: 76.6394,
    population: 3_001_127,
    infraScore: 6.8,
  },
  {
    id: "telangana__hyderabad",
    name: "Hyderabad",
    country: "India",
    state: "Telangana",
    lat: 17.385,
    lng: 78.4867,
    population: 3_943_323,
    infraScore: 7.2,
  },
  {
    id: "andhra-pradesh__visakhapatnam",
    name: "Visakhapatnam",
    country: "India",
    state: "Andhra Pradesh",
    lat: 17.6868,
    lng: 83.2185,
    population: 4_288_113,
    infraScore: 6.8,
  },
  {
    id: "odisha__khordha",
    name: "Khordha (Bhubaneswar)",
    country: "India",
    state: "Odisha",
    lat: 20.2961,
    lng: 85.8245,
    population: 2_251_673,
    infraScore: 6.5,
  },
  {
    id: "assam__kamrup-metro",
    name: "Kamrup Metro",
    country: "India",
    state: "Assam",
    lat: 26.1445,
    lng: 91.7362,
    population: 1_253_938,
    infraScore: 6.1,
  },
  {
    id: "punjab__amritsar",
    name: "Amritsar",
    country: "India",
    state: "Punjab",
    lat: 31.634,
    lng: 74.8723,
    population: 2_490_656,
    infraScore: 6.7,
  },
  {
    id: "gujarat__ahmadabad",
    name: "Ahmadabad",
    country: "India",
    state: "Gujarat",
    lat: 23.0225,
    lng: 72.5714,
    population: 7_214_225,
    infraScore: 7.2,
  },
];

function canonicalizeDistrict(district: District): District {
  const canonical =
    INDIA_ADMIN_DISTRICT_BY_ID.get(district.id) ??
    INDIA_ADMIN_DISTRICT_BY_STATE_AND_NAME.get(
      `${district.state.toLocaleLowerCase("en-IN")}__${district.name.toLocaleLowerCase("en-IN")}`,
    );
  if (!canonical) return district;
  const state = INDIA_ADMIN_STATE_BY_ID.get(canonical.stateId);
  if (!state) return district;
  return { ...district, id: canonical.id, name: canonical.name, state: state.name };
}

function cacheDistrict(district: District): void {
  if (!cachedDistricts) return;
  const cachedIndex = cachedDistricts.findIndex((item) => item.id === district.id);
  if (cachedIndex === -1) cachedDistricts.push(district);
  else cachedDistricts[cachedIndex] = district;
}

async function readSeedDistricts(): Promise<District[]> {
  const path = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../engine/sample/districts.json",
  );
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value)) throw new Error("District fixture must contain an array");
  return value as District[];
}

export async function listDistricts(): Promise<District[]> {
  if (cachedDistricts) return cachedDistricts;
  const db = getDb();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection("districts").get(), 8000);
      if (!snapshot.empty) {
        // Deduplicate legacy aliases in O(n), preferring canonical Firestore document IDs.
        const byCanonicalId = new Map<string, District>();
        for (const document of snapshot.docs) {
          const district = canonicalizeDistrict(document.data() as District);
          if (!byCanonicalId.has(district.id) || document.id === district.id) {
            byCanonicalId.set(district.id, district);
          }
        }
        const districts = [...byCanonicalId.values()];
        cachedDistricts = districts;
        return districts;
      }
    } catch (error) {
      logger.error("Could not load districts from Firestore; using local fixture", error);
    }
  }
  cachedDistricts = (await readSeedDistricts()).map(canonicalizeDistrict);
  return cachedDistricts;
}

export async function ensureIndiaDistrictRecord(
  districtId: string,
  lat: number,
  lng: number,
): Promise<District | undefined> {
  const entry = INDIA_ADMIN_DISTRICT_BY_ID.get(districtId);
  if (!entry) return undefined;
  const state = INDIA_ADMIN_STATE_BY_ID.get(entry.stateId);
  if (!state) return undefined;

  const db = getDb();
  const reference = db?.collection("districts").doc(entry.id);
  if (reference) {
    const current = await withTimeout(reference.get(), 8000);
    if (current.exists) {
      const district = canonicalizeDistrict(current.data() as District);
      cacheDistrict(district);
      return district;
    }
  }

  const district: District = {
    id: entry.id,
    name: entry.name,
    country: "India",
    state: state.name,
    lat,
    lng,
    infraScore: 5,
    population: null,
  };

  if (reference) {
    try {
      await withTimeout(reference.create(district), 8000);
    } catch (error) {
      const isAlreadyCreated =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === 6 || error.code === "already-exists");
      if (!isAlreadyCreated) throw error;
      const current = await withTimeout(reference.get(), 8000);
      if (!current.exists) throw new Error(`District ${entry.id} disappeared during creation.`);
      const existingDistrict = canonicalizeDistrict(current.data() as District);
      cacheDistrict(existingDistrict);
      return existingDistrict;
    }
  }

  cacheDistrict(district);
  return district;
}
