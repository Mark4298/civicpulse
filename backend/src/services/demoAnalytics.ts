import type { HotspotsResponse, StatsResponse } from "@civicpulse/shared";
import { getDb } from "../config/firebase.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/timeout.js";

export const DEMO_HOTSPOTS: HotspotsResponse = {
  hotspots: [
    {
      districtId: "in-delhi",
      districtName: "Delhi",
      country: "India",
      lat: 28.6139,
      lng: 77.209,
      priorityScore: 16.4,
      topCategory: "roads",
      complaintCount: 28,
      avgSeverity: 4.1,
      recommendation:
        "Prioritize corridor resurfacing and safer junction upgrades. Repeated high-severity road reports indicate broad commuter impact.",
    },
    {
      districtId: "br-sao-paulo",
      districtName: "São Paulo",
      country: "Brazil",
      lat: -23.5505,
      lng: -46.6333,
      priorityScore: 13.8,
      topCategory: "water",
      complaintCount: 24,
      avgSeverity: 4.6,
      recommendation:
        "Fund a targeted water-main renewal and leak detection program. High reported severity suggests urgent service reliability needs.",
    },
    {
      districtId: "za-johannesburg",
      districtName: "Johannesburg",
      country: "South Africa",
      lat: -26.2041,
      lng: 28.0473,
      priorityScore: 11.2,
      topCategory: "electricity",
      complaintCount: 21,
      avgSeverity: 3.2,
      recommendation:
        "Upgrade neighborhood transformers and feeder protection. Frequent power concerns warrant a focused reliability project.",
    },
    {
      districtId: "ru-moscow",
      districtName: "Moscow",
      country: "Russia",
      lat: 55.7558,
      lng: 37.6173,
      priorityScore: 8.6,
      topCategory: "sanitation",
      complaintCount: 18,
      avgSeverity: 3.8,
      recommendation:
        "Expand scheduled waste collection and repair overloaded transfer points. The report volume indicates persistent neighborhood pressure.",
    },
    {
      districtId: "cn-shanghai",
      districtName: "Shanghai",
      country: "China",
      lat: 31.2304,
      lng: 121.4737,
      priorityScore: 7.9,
      topCategory: "internet",
      complaintCount: 16,
      avgSeverity: 3.6,
      recommendation:
        "Improve last-mile broadband capacity and public Wi-Fi coverage. Clustered connectivity complaints point to localized access gaps.",
    },
  ],
  clusters: [
    {
      clusterId: 0,
      districtId: "in-delhi",
      districtName: "Delhi",
      country: "India",
      centroid: { lat: 28.62, lng: 77.21 },
      memberCount: 28,
      priorityScore: 16.4,
      avgSeverity: 4.1,
      topCategory: "roads",
    },
    {
      clusterId: 1,
      districtId: "br-sao-paulo",
      districtName: "São Paulo",
      country: "Brazil",
      centroid: { lat: -23.55, lng: -46.63 },
      memberCount: 24,
      priorityScore: 13.8,
      avgSeverity: 4.6,
      topCategory: "water",
    },
    {
      clusterId: 2,
      districtId: "za-johannesburg",
      districtName: "Johannesburg",
      country: "South Africa",
      centroid: { lat: -26.2, lng: 28.05 },
      memberCount: 21,
      priorityScore: 11.2,
      avgSeverity: 3.2,
      topCategory: "electricity",
    },
    {
      clusterId: 3,
      districtId: "ru-moscow",
      districtName: "Moscow",
      country: "Russia",
      centroid: { lat: 55.76, lng: 37.62 },
      memberCount: 18,
      priorityScore: 8.6,
      avgSeverity: 3.8,
      topCategory: "sanitation",
    },
    {
      clusterId: 4,
      districtId: "cn-shanghai",
      districtName: "Shanghai",
      country: "China",
      centroid: { lat: 31.23, lng: 121.47 },
      memberCount: 16,
      priorityScore: 7.9,
      avgSeverity: 3.6,
      topCategory: "internet",
    },
  ],
};

export const DEMO_STATS: StatsResponse = {
  isDemo: true,
  totalComplaints: 120,
  languages: { en: 30, hi: 30, pt: 30, ru: 30 },
  categories: {
    roads: 22,
    water: 21,
    electricity: 20,
    sanitation: 19,
    healthcare: 19,
    internet: 19,
    drainage: 0,
    education: 0,
    transport: 0,
    safety: 0,
    other: 0,
  },
  countries: { India: 30, Brazil: 24, Russia: 22, China: 22, "South Africa": 22 },
  districtsCovered: 30,
};

let firestoreStatusCheckedAt = 0;
let firestoreUnavailable = false;
let lastWarningAt = 0;
let firestoreCheck: Promise<boolean> | null = null;

export async function shouldServeDemoAnalytics(): Promise<boolean> {
  const db = getDb();
  if (!db) return true;
  if (Date.now() - firestoreStatusCheckedAt < 10_000) return firestoreUnavailable;
  if (firestoreCheck) return firestoreCheck;

  firestoreCheck = (async () => {
    try {
      await withTimeout(db.collection("complaints").limit(1).get(), 4000);
      firestoreUnavailable = false;
    } catch (error) {
      firestoreUnavailable = true;
      if (Date.now() - lastWarningAt >= 60_000) {
        lastWarningAt = Date.now();
        logger.warn(
          `Firestore unavailable; demo analytics enabled (${error instanceof Error ? error.constructor.name : typeof error})`,
        );
      }
    } finally {
      firestoreStatusCheckedAt = Date.now();
      firestoreCheck = null;
    }
    return firestoreUnavailable;
  })();
  return firestoreCheck;
}
