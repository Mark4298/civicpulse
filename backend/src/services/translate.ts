import type { ComplaintLanguage } from "@civicpulse/shared";

export interface TranslationResult {
  text: string;
  detectedLanguage: ComplaintLanguage;
}

const scriptLanguages: Array<[RegExp, ComplaintLanguage]> = [
  [/\p{Script=Devanagari}/u, "hi"],
  [/\p{Script=Bengali}/u, "bn"],
  [/\p{Script=Tamil}/u, "ta"],
  [/\p{Script=Telugu}/u, "te"],
  [/\p{Script=Gujarati}/u, "gu"],
  [/\p{Script=Kannada}/u, "kn"],
  [/\p{Script=Malayalam}/u, "ml"],
  [/\p{Script=Gurmukhi}/u, "pa"],
  [/\p{Script=Cyrillic}/u, "ru"],
  [/[A-Za-z]/u, "en"],
];

export function detectScriptLanguage(
  text: string,
  languageHint?: ComplaintLanguage,
): ComplaintLanguage {
  if (languageHint) return languageHint;
  return scriptLanguages.find(([pattern]) => pattern.test(text))?.[1] ?? "en";
}

export function translateText(
  text: string,
  detectedLanguage: ComplaintLanguage,
): TranslationResult {
  return { text, detectedLanguage };
}
