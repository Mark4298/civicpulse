import { randomUUID } from "node:crypto";
import type {
  Complaint,
  ComplaintCategory,
  ComplaintLanguage,
  ComplaintSource,
  ComplaintStatus,
} from "@civicpulse/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { classifyText } from "../services/classification.js";
import { classifyByTrie } from "../services/trie.js";
import {
  ensureIndiaDistrictRecord,
  listDistricts,
  suggestIndiaDistrictForLocation,
} from "../services/districts.js";
import { INDIA_ADMIN_DISTRICT_BY_ID, INDIA_ADMIN_STATE_BY_NAME } from "@civicpulse/shared";
import { runEngine } from "../services/engine.js";
import {
  isSupportedTranscriptionMime,
  transcribe,
  transcribeAudio,
  TranscriptionUnavailableError,
} from "../services/speech.js";
import {
  getComplaintById,
  listComplaints,
  saveComplaint,
  updateComplaintStatus,
} from "../utils/complaintStore.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { computeEffectiveSeverity } from "../utils/priorityWeight.js";
import { uploadPhotos } from "../services/storage.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isComplaintSeverity(value: number): value is Complaint["severity"] {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function parseCoordinate(value: unknown, name: string, min: number, max: number): number {
  if (typeof value === "string" && !value.trim()) {
    throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  }
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  }
  return parsed;
}

function parseText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 5000) {
    throw new HttpError(400, "text must be a non-empty string of at most 5000 characters");
  }
  return value.trim();
}

function parseSource(value: unknown, fallback: ComplaintSource): ComplaintSource {
  if (value === undefined) return fallback;
  if (value === "text" || value === "voice" || value === "messaging") return value;
  throw new HttpError(400, "source must be text, voice, or messaging");
}

const complaintLanguages: ComplaintLanguage[] = [
  "en",
  "hi",
  "hi-Latn",
  "bn",
  "pa",
  "gu",
  "or",
  "ta",
  "te",
  "kn",
  "ml",
  "mr",
  "pt",
  "ru",
];

function parseLanguage(value: unknown): ComplaintLanguage | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && complaintLanguages.includes(value as ComplaintLanguage)) {
    return value as ComplaintLanguage;
  }
  throw new HttpError(400, "language is not supported");
}

function extractPhotos(req: Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) {
    return req.files;
  }
  if (req.files && typeof req.files === "object" && "photos" in req.files) {
    return req.files["photos"] as Express.Multer.File[];
  }
  return [];
}

function extractAudio(req: Request): Express.Multer.File | undefined {
  if (req.file) return req.file;
  if (req.files && typeof req.files === "object" && "audio" in req.files) {
    return (req.files["audio"] as Express.Multer.File[])[0];
  }
  return undefined;
}

const validCategories = new Set([
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
]);
const validUrgencies = new Set(["low", "medium", "high", "emergency"]);
const validDurations = new Set(["under_1_week", "1_to_4_weeks", "1_to_6_months", "over_6_months"]);
const validScales = new Set(["me", "street", "neighbourhood", "wide_area"]);

interface SubmitOptions {
  source: ComplaintSource;
  userId: string | null;
  districtId?: string | undefined;
  languageHint?: ComplaintLanguage | undefined;
  userCategory?: string | undefined;
  urgency?: string | undefined;
  duration?: string | undefined;
  affectedScale?: string | undefined;
  landmark?: string | undefined;
  stateName?: string | undefined;
  contactPhone?: string | undefined;
  isAnonymous?: boolean | undefined;
  photos?: Express.Multer.File[] | undefined;
}

async function submitComplaint(
  textValue: unknown,
  latValue: unknown,
  lngValue: unknown,
  options: SubmitOptions,
): Promise<Complaint> {
  const rawText = parseText(textValue);
  const lat = parseCoordinate(latValue, "lat", -90, 90);
  const lng = parseCoordinate(lngValue, "lng", -180, 180);

  // Validate new fields
  if (options.userCategory && !validCategories.has(options.userCategory))
    throw new HttpError(400, "Invalid userCategory");
  if (options.urgency && !validUrgencies.has(options.urgency))
    throw new HttpError(400, "Invalid urgency");
  if (options.duration && !validDurations.has(options.duration))
    throw new HttpError(400, "Invalid duration");
  if (options.affectedScale && !validScales.has(options.affectedScale))
    throw new HttpError(400, "Invalid affectedScale");
  if (options.landmark && options.landmark.length > 200)
    throw new HttpError(400, "Landmark too long");
  if (options.contactPhone && !/^[6-9]\d{9}$/.test(options.contactPhone))
    throw new HttpError(400, "Invalid contactPhone");

  const categoryHint = options.userCategory as ComplaintCategory | undefined;
  const classification = await classifyText(rawText, options.languageHint, categoryHint);
  if (
    options.stateName &&
    !INDIA_ADMIN_STATE_BY_NAME.has(options.stateName.trim().toLocaleLowerCase("en-IN"))
  ) {
    throw new HttpError(400, "Invalid stateName");
  }
  const selectedDistrictDefinition = options.districtId
    ? INDIA_ADMIN_DISTRICT_BY_ID.get(options.districtId)
    : undefined;
  if (options.districtId && !selectedDistrictDefinition) {
    throw new HttpError(400, "Invalid districtId");
  }
  let district: unknown;
  if (selectedDistrictDefinition && options.districtId) {
    district = await ensureIndiaDistrictRecord(options.districtId, lat, lng);
    if (!district) throw new HttpError(400, "Invalid districtId");
  } else {
    const districts = await listDistricts();
    const nearest = await runEngine({ cmd: "nearest", districts, point: { lat, lng } });
    district = nearest.district;
  }
  if (
    !isRecord(district) ||
    typeof district.id !== "string" ||
    typeof district.state !== "string"
  ) {
    throw new Error("Nearest-district lookup returned invalid data");
  }

  const id = randomUUID();
  const date = new Date();
  const referenceId = `CP-${date.getFullYear()}-${Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0")}`;

  const effectiveSeverity = computeEffectiveSeverity(
    classification.severity,
    options.urgency as Complaint["urgency"],
    options.affectedScale as Complaint["affectedScale"],
    options.duration as Complaint["duration"],
  );
  if (!isComplaintSeverity(effectiveSeverity)) {
    throw new Error("Severity calculation returned an invalid value");
  }

  let photoUrls: string[] = [];
  if (options.photos && options.photos.length > 0) {
    if (options.photos.length > 3) throw new HttpError(400, "Max 3 photos allowed");
    // Size is checked by Multer (max 5MB each). We upload asynchronously and wait.
    photoUrls = await uploadPhotos(id, options.photos.slice(0, 3));
  }

  const isAnon = !!options.isAnonymous;
  const storedUserId = isAnon ? null : options.userId;
  const storedContactPhone = isAnon ? undefined : options.contactPhone;

  const complaint: Complaint = {
    id,
    userId: storedUserId,
    status: "submitted",
    rawText,
    translatedText: classification.translatedText,
    detectedLanguage: classification.detectedLanguage,
    category: classification.category,
    classifiedBy: classification.classifiedBy,
    tags: classification.tags,
    severity: effectiveSeverity,
    districtId: district.id,
    lat,
    lng,
    timestamp: date.toISOString(),
    source: options.source,
    userCategory: categoryHint,
    urgency: options.urgency as Complaint["urgency"],
    duration: options.duration as Complaint["duration"],
    affectedScale: options.affectedScale as Complaint["affectedScale"],
    landmark: options.landmark,
    stateName: district.state,
    photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
    contactPhone: storedContactPhone,
    isAnonymous: isAnon,
    referenceId,
  };
  await saveComplaint(complaint);
  return complaint;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) throw new HttpError(400, "Request body must be a JSON object");
  return body;
}

const complaintStatuses: ComplaintStatus[] = ["submitted", "reviewing", "in_progress", "resolved"];

export const updateStatus: RequestHandler = async (request, response, next) => {
  try {
    const body = bodyRecord(request.body);
    if (
      typeof body.status !== "string" ||
      !complaintStatuses.includes(body.status as ComplaintStatus)
    ) {
      throw new HttpError(400, "status must be submitted, reviewing, in_progress, or resolved");
    }
    const id = request.params.id;
    if (typeof id !== "string" || !id || id.length > 128) {
      throw new HttpError(400, "complaint id is invalid");
    }
    if (
      body.adminNote !== undefined &&
      (typeof body.adminNote !== "string" || body.adminNote.length > 500)
    ) {
      throw new HttpError(400, "adminNote must be a string of at most 500 characters");
    }
    const complaint = await updateComplaintStatus(
      id,
      body.status as ComplaintStatus,
      request.user?.uid ?? "admin",
      typeof body.adminNote === "string" && body.adminNote.trim()
        ? body.adminNote.trim()
        : undefined,
    );
    response.json({ complaint });
  } catch (error) {
    next(error);
  }
};

export const getById: RequestHandler = async (request, response, next) => {
  try {
    const id = request.params.id;
    if (typeof id !== "string" || !id || id.length > 128) {
      throw new HttpError(400, "complaint id is invalid");
    }
    const complaint = await getComplaintById(id);
    response.json({ complaint });
  } catch (error) {
    next(error);
  }
};

export const createText: RequestHandler = async (request, response, next) => {
  try {
    if (!request.user?.uid) {
      throw new HttpError(401, "Please sign in to submit a report");
    }
    const body = bodyRecord(request.body);
    const photos = extractPhotos(request);
    const complaint = await submitComplaint(body.text, body.lat, body.lng, {
      source: parseSource(body.source, "text"),
      userId: request.user.uid,
      districtId: typeof body.districtId === "string" ? body.districtId : undefined,
      languageHint: parseLanguage(body.language),
      userCategory: typeof body.userCategory === "string" ? body.userCategory : undefined,
      urgency: typeof body.urgency === "string" ? body.urgency : undefined,
      duration: typeof body.duration === "string" ? body.duration : undefined,
      affectedScale: typeof body.affectedScale === "string" ? body.affectedScale : undefined,
      landmark: typeof body.landmark === "string" ? body.landmark : undefined,
      stateName: typeof body.stateName === "string" ? body.stateName : undefined,
      contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : undefined,
      isAnonymous:
        typeof body.isAnonymous === "string" ? body.isAnonymous === "true" : !!body.isAnonymous,
      photos,
    });
    response.status(201).json({ complaint });
  } catch (error) {
    next(error);
  }
};

export const previewClassification: RequestHandler = async (request, response, next) => {
  try {
    const body = bodyRecord(request.body);
    const text = parseText(body.text);
    if (text.length < 15) {
      throw new HttpError(400, "text must contain at least 15 characters");
    }
    const trie = classifyByTrie(text);
    const classification = await classifyText(text);
    if (classification.classifiedBy === "fallback") {
      response.json({ category: null });
      return;
    }
    response.json({
      category: classification.category,
      confidence: classification.classifiedBy === "trie" ? trie?.confidence ?? null : null,
      classifiedBy: classification.classifiedBy,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    logger.warn(`Category preview failed (${errorClass}); returning no suggestion`);
    response.json({ category: null });
  }
};

export const suggestLocation: RequestHandler = async (request, response, next) => {
  const rawLat = request.query.lat;
  const rawLng = request.query.lng;
  if (typeof rawLat !== "string" || typeof rawLng !== "string") {
    next(new HttpError(400, "lat and lng are required"));
    return;
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    next(new HttpError(400, "lat must be between -90 and 90"));
    return;
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    next(new HttpError(400, "lng must be between -180 and 180"));
    return;
  }
  try {
    response.json({ suggestion: await suggestIndiaDistrictForLocation(lat, lng) });
  } catch (error) {
    next(error);
  }
};

export const createVoice: RequestHandler = async (request, response, next) => {
  try {
    if (!request.user?.uid) {
      throw new HttpError(401, "Please sign in to submit a report");
    }
    const body = bodyRecord(request.body);
    const audio = extractAudio(request);
    if (!audio) throw new HttpError(400, "An audio file is required in the audio field");
    const transcript = await transcribeAudio(audio.buffer, audio.mimetype);
    if (!transcript)
      throw new HttpError(
        422,
        "Audio could not be transcribed; check format or Speech API configuration",
      );
    const photos = extractPhotos(request);
    const complaint = await submitComplaint(transcript, body.lat, body.lng, {
      source: "voice",
      userId: request.user.uid,
      districtId: typeof body.districtId === "string" ? body.districtId : undefined,
      userCategory: typeof body.userCategory === "string" ? body.userCategory : undefined,
      urgency: typeof body.urgency === "string" ? body.urgency : undefined,
      duration: typeof body.duration === "string" ? body.duration : undefined,
      affectedScale: typeof body.affectedScale === "string" ? body.affectedScale : undefined,
      landmark: typeof body.landmark === "string" ? body.landmark : undefined,
      stateName: typeof body.stateName === "string" ? body.stateName : undefined,
      contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : undefined,
      isAnonymous:
        typeof body.isAnonymous === "string" ? body.isAnonymous === "true" : !!body.isAnonymous,
      photos,
    });
    response.status(201).json({ complaint, transcript });
  } catch (error) {
    next(error);
  }
};

const speakingLanguages = new Set([
  "hi-IN",
  "en-IN",
  "bn-IN",
  "ta-IN",
  "te-IN",
  "mr-IN",
  "gu-IN",
  "kn-IN",
  "ml-IN",
  "pa-IN",
]);

export const transcribeReportAudio: RequestHandler = async (request, response, next) => {
  try {
    const audio = request.file;
    if (!audio) throw new HttpError(400, "An audio file is required");
    if (!audio.mimetype.startsWith("audio/")) {
      throw new HttpError(415, "The uploaded file must be audio");
    }
    if (!isSupportedTranscriptionMime(audio.mimetype)) {
      throw new HttpError(415, "Audio must be WAV format");
    }
    const language = request.body.language;
    if (typeof language !== "string" || !speakingLanguages.has(language)) {
      throw new HttpError(400, "language must be a supported Indian language code");
    }

    const result = await transcribe(audio.buffer, audio.mimetype, language);
    if (!result.text.trim()) throw new HttpError(422, "Could not hear anything");
    response.json(result);
  } catch (error) {
    if (error instanceof TranscriptionUnavailableError) {
      response.status(503).json({
        code: "TRANSCRIBE_UNAVAILABLE",
        error: error.message,
      });
      return;
    }
    next(error);
  }
};

export const createMessage: RequestHandler = async (request, response, next) => {
  try {
    if (!request.user?.uid) {
      throw new HttpError(401, "Please sign in to submit a report");
    }
    const body = bodyRecord(request.body);
    const photos = extractPhotos(request);
    const complaint = await submitComplaint(body.text ?? body.message, body.lat, body.lng, {
      source: "messaging",
      userId: request.user.uid,
      userCategory: typeof body.userCategory === "string" ? body.userCategory : undefined,
      urgency: typeof body.urgency === "string" ? body.urgency : undefined,
      duration: typeof body.duration === "string" ? body.duration : undefined,
      affectedScale: typeof body.affectedScale === "string" ? body.affectedScale : undefined,
      landmark: typeof body.landmark === "string" ? body.landmark : undefined,
      stateName: typeof body.stateName === "string" ? body.stateName : undefined,
      contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : undefined,
      isAnonymous:
        typeof body.isAnonymous === "string" ? body.isAnonymous === "true" : !!body.isAnonymous,
      photos,
    });
    response.status(201).json({ complaint });
  } catch (error) {
    next(error);
  }
};

async function listComplaintsPage(
  request: Request,
  response: Response,
  next: NextFunction,
  userId?: string,
): Promise<void> {
  try {
    const rawLimit = request.query.limit;
    const limit =
      rawLimit === undefined ? 20 : typeof rawLimit === "string" ? Number(rawLimit) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError(400, "limit must be an integer between 1 and 100");
    }
    const rawCursor = request.query.cursor;
    if (rawCursor !== undefined && (typeof rawCursor !== "string" || !rawCursor.trim())) {
      throw new HttpError(400, "cursor must be a non-empty string");
    }
    response.json(await listComplaints(limit, rawCursor, userId));
  } catch (error) {
    if (!(error instanceof HttpError)) logger.error("Could not list complaints", error);
    next(error);
  }
}

export const list: RequestHandler = (request, response, next) => {
  void listComplaintsPage(request, response, next);
};

export const listMine: RequestHandler = (request, response, next) => {
  if (!request.user) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  void listComplaintsPage(request, response, next, request.user.uid);
};
