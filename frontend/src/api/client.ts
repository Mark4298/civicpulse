import type {
  Complaint,
  ComplaintLanguage,
  ComplaintSource,
  ComplaintStatus,
  District,
  UserProfile,
} from "@civicpulse/shared";
import type { HotspotsResponse, StatsResponse } from "@civicpulse/shared";
import { auth } from "../lib/firebase";

export interface SubmissionResponse {
  complaint: Complaint;
}

export interface ClassificationPreview {
  category: Complaint["category"] | null;
  confidence?: number | null;
  classifiedBy?: "trie" | "gemini";
}

export interface SignupRequest {
  email: string;
  password: string;
  displayName: string;
  state: string;
  district: string;
}

export interface ComplaintPage {
  complaints: Complaint[];
  nextCursor: string | null;
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const user = auth?.currentUser;
  if (!user) {
    return fetch(`${apiBase}${path}`, { ...init, headers });
  }

  headers.set("authorization", `Bearer ${await user.getIdToken()}`);
  let response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (response.status !== 401) return response;

  try {
    headers.set("authorization", `Bearer ${await user.getIdToken(true)}`);
    response = await fetch(`${apiBase}${path}`, { ...init, headers });
  } catch {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname || "/")}`);
    throw new Error("Please sign in to submit a report");
  }

  if (response.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname || "/")}`);
    throw new Error("Please sign in to submit a report");
  }

  return response;
}

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : fallback;
    throw new Error(message);
  }
  if (typeof payload !== "object" || payload === null) {
    throw new Error("The server returned an invalid response.");
  }
  return payload as T;
}

async function readResponse(response: Response): Promise<SubmissionResponse> {
  const payload = await readPayload<{ complaint?: Complaint; transcript?: string }>(
    response,
    "Your report could not be submitted. Please try again.",
  );
  if (!payload.complaint) throw new Error("The server returned an invalid response.");
  return payload as SubmissionResponse;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(path, signal ? { signal } : {});
  return readPayload<T>(response, `Request failed (${response.status})`);
}

export interface DashboardData {
  hotspots: HotspotsResponse;
  stats: StatsResponse;
}

export interface AiHealthStatus {
  geminiConfigured: boolean;
  lastSuccessAt: string | null;
  lastErrorType: string | null;
}

export async function getDashboardData(signal: AbortSignal): Promise<DashboardData> {
  const [hotspots, stats] = await Promise.all([
    getJson<HotspotsResponse>("/api/hotspots", signal),
    getJson<StatsResponse>("/api/stats", signal),
  ]);
  return { hotspots, stats };
}

export function getAiHealth(signal?: AbortSignal): Promise<AiHealthStatus> {
  return getJson("/api/health/ai", signal);
}

export async function getSignupDistricts(signal?: AbortSignal): Promise<District[]> {
  const result = await getJson<{ districts: District[] }>("/api/auth/districts", signal);
  return result.districts;
}

export function getLocationSuggestion(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<{ suggestion: District | null }> {
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return getJson(`/api/complaints/location-suggestion?${query}`, signal);
}

export async function previewClassification(
  text: string,
  signal?: AbortSignal,
): Promise<ClassificationPreview> {
  const response = await apiFetch("/api/classify/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    ...(signal ? { signal } : {}),
  });
  return readPayload<ClassificationPreview>(
    response,
    "Category preview is unavailable.",
  );
}

export async function registerAccount(input: SignupRequest): Promise<UserProfile> {
  const response = await apiFetch("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await readPayload<{ user: UserProfile }>(response, "Could not create your account.");
  return result.user;
}

export function getCurrentUserProfile(signal?: AbortSignal): Promise<{ user: UserProfile }> {
  return getJson("/api/auth/me", signal);
}

export function getMyReports(signal?: AbortSignal, cursor?: string): Promise<ComplaintPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return getJson(`/api/complaints/mine${query}`, signal);
}

export function getComplaintQueue(signal: AbortSignal): Promise<ComplaintPage> {
  return getJson("/api/complaints?limit=20", signal);
}

export async function updateComplaintStatus(
  id: string,
  status: ComplaintStatus,
): Promise<Complaint> {
  const response = await apiFetch(`/api/complaints/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const result = await readPayload<{ complaint: Complaint }>(
    response,
    "Could not update complaint status.",
  );
  return result.complaint;
}

export async function submitWizardComplaint(form: FormData): Promise<SubmissionResponse> {
  const response = await apiFetch("/api/complaints/text", {
    method: "POST",
    body: form,
  });
  return readResponse(response);
}

export async function transcribeVoice(audio: File, language: string): Promise<string> {
  const form = new FormData();
  form.append("audio", audio);
  form.append("language", language);
  const response = await apiFetch("/api/transcribe", { method: "POST", body: form });
  const result = await readPayload<{ text: string; provider: string }>(
    response,
    "Voice transcription is unavailable. You can type your report instead.",
  );
  if (typeof result.text !== "string" || !result.text.trim()) {
    throw new Error("Could not hear anything. You can type your report instead.");
  }
  return result.text;
}
