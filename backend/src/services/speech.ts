import { getGeminiModel } from "./gemini.js";
import { logger } from "../utils/logger.js";

export interface TranscriptionResult {
  text: string;
  provider: "gemini";
}

export class TranscriptionUnavailableError extends Error {
  constructor(message = "Speech transcription is unavailable. Please type your report instead.") {
    super(message);
    this.name = "TranscriptionUnavailableError";
  }
}

const supportedAudioTypes = new Set([
  "audio/wav",
]);
const warningTimes = new Map<string, number>();

export function isSupportedTranscriptionMime(mimeType: string): boolean {
  return supportedAudioTypes.has(mimeType.toLowerCase().split(";")[0] ?? "");
}

function warnFailure(error: unknown): void {
  const type = error instanceof Error ? error.constructor.name : typeof error;
  const now = Date.now();
  if (now - (warningTimes.get(type) ?? 0) < 60_000) return;
  warningTimes.set(type, now);
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`Gemini audio transcription failed (${type}): ${message}`);
}

async function transcribeWithGemini(
  buffer: Buffer,
  mimeType: string,
  language: string,
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) throw new TranscriptionUnavailableError();
  const model = getGeminiModel();
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            type: "text",
            text: `Speaking language: ${language}. Transcribe this audio verbatim in its original script. Do not translate or summarize.`,
          },
          { type: "audio", data: buffer.toString("base64"), mime_type: mimeType },
        ],
        response_format: {
          type: "object",
          properties: {
            text: { type: "string" },
          },
          required: ["text"],
        },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    const type = response.status === 429 ? "quota" : `HTTP ${response.status}`;
    throw new Error(`Gemini audio transcription returned ${type}`);
  }
  const payload: unknown = await response.json();
  const candidate = (payload as { output_text?: unknown }).output_text;
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error("Gemini returned no transcription content");
  }
  const parsed: unknown = JSON.parse(candidate);
  if (typeof parsed !== "object" || parsed === null || !("text" in parsed)) {
    throw new Error("Gemini returned invalid transcription JSON");
  }
  if (typeof parsed.text !== "string") throw new Error("Gemini returned invalid transcription text");
  return parsed.text.trim();
}

export async function transcribe(
  buffer: Buffer,
  mimeType: string,
  language: string,
): Promise<TranscriptionResult> {
  if (!isSupportedTranscriptionMime(mimeType)) {
    throw new Error("Audio format is unsupported. Please try again or type your report instead.");
  }
  try {
    return { text: await transcribeWithGemini(buffer, mimeType, language), provider: "gemini" };
  } catch (error) {
    warnFailure(error);
    throw new TranscriptionUnavailableError();
  }
}

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    return (await transcribe(buffer, mimeType, "en-IN")).text;
  } catch {
    return "";
  }
}
