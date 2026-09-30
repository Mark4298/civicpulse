import { createHash } from "node:crypto";
import type { Complaint, ComplaintCategory, ComplaintLanguage } from "@civicpulse/shared";
import { detectLanguage } from "@civicpulse/shared";
import { LRUCache } from "../utils/lru.js";
import { logger } from "../utils/logger.js";
import { classifyWithGemini } from "./gemini.js";
import { classifyByTrie } from "./trie.js";
import { detectScriptLanguage, translateText } from "./translate.js";

export interface ClassificationResult {
  category: ComplaintCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  summary: string;
  tags: string[];
  translatedText: string;
  detectedLanguage: ComplaintLanguage;
  classifiedBy: NonNullable<Complaint["classifiedBy"]>;
}

const cache = new LRUCache<string, ClassificationResult>(500);
const highConfidenceThreshold = 0.85;
let lastMissingGeminiWarning = 0;

function normalizedHash(text: string, languageHint?: ComplaintLanguage): string {
  const normalized = text.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/gu, " ");
  return createHash("sha256").update(`${languageHint ?? "auto"}\0${normalized}`).digest("hex");
}

// Cache lookup is expected O(1); hashing and classification input scans are O(L).
export async function classifyText(
  text: string,
  languageHint?: ComplaintLanguage,
  userCategory?: ComplaintCategory,
): Promise<ClassificationResult> {
  const key = normalizedHash(text, languageHint) + (userCategory ? `_${userCategory}` : "");
  const cached = cache.get(key);
  if (cached) return cached;

  const scriptLanguage = detectLanguage(text).code;
  const localLanguage =
    scriptLanguage === "hi" && languageHint === "mr"
      ? "mr"
      : scriptLanguage === "hi-Latn" && (languageHint === "hi" || languageHint === "mr")
        ? languageHint
        : scriptLanguage === "en"
          ? detectScriptLanguage(text, languageHint)
          : scriptLanguage;
  const trustScriptDetection = scriptLanguage !== "en" && scriptLanguage !== "hi-Latn";
  let result: ClassificationResult;
  let cacheResult = true;
  if (!process.env.GEMINI_API_KEY && Date.now() - lastMissingGeminiWarning >= 60_000) {
    lastMissingGeminiWarning = Date.now();
    logger.warn("Gemini is not configured; classifying locally and keeping source text untranslated");
  }

  if (userCategory) {
    const gemini = await classifyWithGemini(text);
    cacheResult = gemini !== null;
    result = {
      category: userCategory,
      severity: gemini?.severity ?? 3,
      summary: gemini?.summary ?? (text.trim().slice(0, 300) || "Infrastructure issue reported."),
      tags: gemini?.tags ?? [],
      translatedText: gemini?.translatedText ?? text,
      detectedLanguage: trustScriptDetection
        ? localLanguage
        : (languageHint ?? gemini?.detectedLanguage ?? localLanguage),
      classifiedBy: "user",
    };
  } else {
    const trie = classifyByTrie(text);

    if (trie && trie.confidence >= highConfidenceThreshold) {
      const translation = translateText(text, localLanguage);
      result = {
        category: trie.category,
        severity: 3,
        summary: trie.summary,
        tags: [],
        translatedText: translation.text,
        detectedLanguage: translation.detectedLanguage,
        classifiedBy: "trie",
      };
    } else {
      const gemini = await classifyWithGemini(text);
      cacheResult = gemini !== null;
      result = gemini
        ? {
            ...gemini,
            detectedLanguage: trustScriptDetection
              ? localLanguage
              : (languageHint ?? gemini.detectedLanguage),
            classifiedBy: "gemini",
          }
        : {
            category: trie?.category ?? "roads",
            severity: 3,
            summary: text.trim().slice(0, 300) || "Infrastructure issue reported.",
            tags: [],
            translatedText: text,
            detectedLanguage: localLanguage,
            classifiedBy: "fallback",
          };
    }
  }

  if (cacheResult) cache.put(key, result);
  return result;
}
