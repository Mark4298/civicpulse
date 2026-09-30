export {
  INDIA_ADMIN_DISTRICT_BY_ID,
  INDIA_ADMIN_DISTRICT_BY_STATE_AND_NAME,
  INDIA_ADMIN_STATE_BY_ID,
  INDIA_ADMIN_STATE_BY_NAME,
  INDIA_ADMIN_STATES,
} from "./data/indiaAdmin.js";

export type ComplaintCategory =
  | "roads"
  | "water"
  | "electricity"
  | "sanitation"
  | "healthcare"
  | "internet"
  | "drainage"
  | "education"
  | "transport"
  | "safety"
  | "other";

export type ComplaintLanguage =
  | "en"
  | "hi"
  | "bn"
  | "ta"
  | "te"
  | "mr"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "or"
  | "hi-Latn"
  | "pt"
  | "ru";
export type ComplaintSeverity = 1 | 2 | 3 | 4 | 5;
export type ComplaintSource = "text" | "voice" | "messaging";
export type ComplaintStatus = "submitted" | "reviewing" | "in_progress" | "resolved";
export type UserRole = "citizen" | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  state: string;
  district: string;
  createdAt: string;
}

export interface Complaint {
  id: string;
  userId: string | null;
  status: ComplaintStatus;
  rawText: string;
  translatedText: string;
  detectedLanguage: ComplaintLanguage;
  category: ComplaintCategory;
  classifiedBy?: "user" | "trie" | "gemini" | "fallback" | undefined;
  tags?: string[] | undefined;
  severity: ComplaintSeverity;
  districtId: string;
  lat: number;
  lng: number;
  timestamp: string;
  source: ComplaintSource;

  userCategory?: ComplaintCategory | undefined;
  urgency?: "low" | "medium" | "high" | "emergency" | undefined;
  duration?: "under_1_week" | "1_to_4_weeks" | "1_to_6_months" | "over_6_months" | undefined;
  affectedScale?: "me" | "street" | "neighbourhood" | "wide_area" | undefined;
  landmark?: string | undefined;
  stateName?: string | undefined;
  photoUrls?: string[] | undefined;
  contactPhone?: string | undefined;
  isAnonymous?: boolean | undefined;
  referenceId?: string | undefined;
}

export interface District {
  id: string;
  name: string;
  country: string;
  state: string;
  lat: number;
  lng: number;
  infraScore: number;
  population: number | null;
}

export interface Hotspot {
  districtId: string;
  districtName: string;
  country: string;
  lat: number;
  lng: number;
  priorityScore: number;
  topCategory: ComplaintCategory;
  complaintCount: number;
  avgSeverity: number;
  recommendation: string;
}

export interface HotspotCluster {
  clusterId: number;
  districtId: string;
  districtName: string;
  country: string;
  centroid: { lat: number; lng: number };
  memberCount: number;
  priorityScore: number;
  avgSeverity: number;
  topCategory: ComplaintCategory;
}

export interface HotspotsResponse {
  hotspots: Hotspot[];
  clusters: HotspotCluster[];
}

export interface StatsResponse {
  totalComplaints: number;
  languages: Record<string, number>;
  categories: Record<ComplaintCategory, number>;
  countries: Record<string, number>;
  districtsCovered: number;
  isDemo?: boolean;
}
