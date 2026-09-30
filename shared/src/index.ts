export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type {
  Complaint,
  ComplaintCategory,
  ComplaintLanguage,
  ComplaintSeverity,
  ComplaintSource,
  ComplaintStatus,
  District,
  Hotspot,
  HotspotCluster,
  HotspotsResponse,
  StatsResponse,
  UserProfile,
  UserRole,
} from "../types.js";

export {
  countLetters,
  detectLanguage,
} from "../utils/detectScript.js";

export {
  INDIA_ADMIN_DISTRICT_BY_ID,
  INDIA_ADMIN_DISTRICT_BY_STATE_AND_NAME,
  INDIA_ADMIN_STATE_BY_ID,
  INDIA_ADMIN_STATE_BY_NAME,
  INDIA_ADMIN_STATES,
} from "../types.js";
