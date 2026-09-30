import type { ComplaintCategory, ComplaintLanguage } from "@civicpulse/shared";
import { logger } from "../utils/logger.js";

export interface GeminiClassification {
  category: ComplaintCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  summary: string;
  tags: string[];
  detectedLanguage: ComplaintLanguage;
  translatedText: string;
}

export type AiErrorType =
  | "auth"
  | "quota"
  | "timeout"
  | "model_not_found"
  | "bad_json"
  | "configuration"
  | "api";

export interface AiHealthStatus {
  geminiConfigured: boolean;
  lastSuccessAt: string | null;
  lastErrorType: AiErrorType | null;
}

const categories: ComplaintCategory[] = [
  "roads",
  "water",
  "electricity",
  "sanitation",
  "healthcare",
  "internet",
];
const languageTags: Record<string, ComplaintLanguage> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "bn-IN": "bn",
  "ta-IN": "ta",
  "te-IN": "te",
  "mr-IN": "mr",
  "gu-IN": "gu",
  "kn-IN": "kn",
  "ml-IN": "ml",
  "pa-IN": "pa",
  "pt-BR": "pt",
  "ru-RU": "ru",
};
const warningIntervals = new Map<AiErrorType, number>();
let lastSuccessAt: string | null = null;
let lastErrorType: AiErrorType | null = null;

class GeminiFailure extends Error {
  constructor(
    readonly type: AiErrorType,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GeminiFailure";
  }
}

function responseErrorType(status: number): AiErrorType {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status === 404) return "model_not_found";
  return "api";
}

function responseMessage(payload: unknown, status: number): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return `Gemini returned HTTP ${status}`;
}

function errorType(error: unknown): AiErrorType {
  if (error instanceof GeminiFailure) return error.type;
  if (error instanceof SyntaxError) return "bad_json";
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "timeout";
  }
  return "api";
}

function warnFallback(error: unknown, type: AiErrorType): void {
  const now = Date.now();
  if (now - (warningIntervals.get(type) ?? 0) < 60_000) return;
  warningIntervals.set(type, now);
  const errorClass = error instanceof Error ? error.constructor.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`Gemini fallback (${type}; ${errorClass}): ${message}`);
}

export function getAiHealthStatus(): AiHealthStatus {
  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    lastSuccessAt,
    lastErrorType,
  };
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function classifyWithGemini(text: string): Promise<GeminiClassification | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const error = new GeminiFailure("configuration", "GEMINI_API_KEY is not configured");
    lastErrorType = error.type;
    warnFallback(error, error.type);
    return null;
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Analyze this citizen infrastructure report. Detect its language and translate to English. Return one JSON object with detectedLanguage as a BCP-47 tag, translatedText in English, category, severity (1-5), concise summary, and tags. Preserve these requirements: ${JSON.stringify(text)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                category: { type: "STRING", enum: categories },
                severity: { type: "INTEGER", minimum: 1, maximum: 5 },
                summary: { type: "STRING" },
                tags: { type: "ARRAY", items: { type: "STRING" } },
                detectedLanguage: { type: "STRING", enum: Object.keys(languageTags) },
                translatedText: { type: "STRING" },
              },
              required: [
                "category",
                "severity",
                "summary",
                "tags",
                "detectedLanguage",
                "translatedText",
              ],
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status !== 429 || attempt === 1) break;
      await delay(250 * 2 ** attempt);
    }

    if (!response) throw new GeminiFailure("api", "Gemini returned no response");
    const payload: unknown = await response.json().catch((cause: unknown) => {
      throw new GeminiFailure("bad_json", "Gemini returned an invalid JSON response", { cause });
    });
    if (!response.ok) {
      const type = responseErrorType(response.status);
      throw new GeminiFailure(type, responseMessage(payload, response.status));
    }
    const candidate = (
      payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    ).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new GeminiFailure("bad_json", "Gemini returned no classification content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (cause) {
      throw new GeminiFailure("bad_json", "Gemini returned invalid classification JSON", { cause });
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new GeminiFailure("bad_json", "Gemini classification JSON must be an object");
    }
    const value = parsed as Record<string, unknown>;
    if (
      !categories.includes(value.category as ComplaintCategory) ||
      typeof value.severity !== "number" ||
      typeof value.summary !== "string" ||
      !Array.isArray(value.tags) ||
      value.tags.some((tag) => typeof tag !== "string") ||
      typeof value.detectedLanguage !== "string" ||
      !languageTags[value.detectedLanguage] ||
      typeof value.translatedText !== "string"
    ) {
      throw new GeminiFailure("bad_json", "Gemini classification is missing required fields");
    }

    const severity = Math.max(1, Math.min(5, Math.round(value.severity))) as
      GeminiClassification["severity"];
    lastSuccessAt = new Date().toISOString();
    lastErrorType = null;
    return {
      category: value.category as ComplaintCategory,
      severity,
      summary: value.summary.slice(0, 500),
      tags: value.tags.slice(0, 5).map((tag: string) => tag.trim().slice(0, 40)),
      detectedLanguage: languageTags[value.detectedLanguage as string]!,
      translatedText: value.translatedText.slice(0, 5000),
    };
  } catch (error) {
    const type = errorType(error);
    lastErrorType = type;
    warnFallback(error, type);
    return null;
  }
}
