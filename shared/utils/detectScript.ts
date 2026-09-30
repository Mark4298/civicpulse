export type DetectedLanguageCode =
  | "en"
  | "hi"
  | "hi-Latn"
  | "bn"
  | "pa"
  | "gu"
  | "or"
  | "ta"
  | "te"
  | "kn"
  | "ml";

export interface LanguageDetection {
  code: DetectedLanguageCode;
  label: string;
  confidence: number;
}

const scriptDefinitions = [
  { start: 0x0900, end: 0x097f, code: "hi", label: "Hindi" },
  { start: 0x0980, end: 0x09ff, code: "bn", label: "Bengali" },
  { start: 0x0a00, end: 0x0a7f, code: "pa", label: "Punjabi" },
  { start: 0x0a80, end: 0x0aff, code: "gu", label: "Gujarati" },
  { start: 0x0b00, end: 0x0b7f, code: "or", label: "Odia" },
  { start: 0x0b80, end: 0x0bff, code: "ta", label: "Tamil" },
  { start: 0x0c00, end: 0x0c7f, code: "te", label: "Telugu" },
  { start: 0x0c80, end: 0x0cff, code: "kn", label: "Kannada" },
  { start: 0x0d00, end: 0x0d7f, code: "ml", label: "Malayalam" },
  { start: 0x0041, end: 0x005a, code: "en", label: "English" },
  { start: 0x0061, end: 0x007a, code: "en", label: "English" },
] as const satisfies ReadonlyArray<{
  start: number;
  end: number;
  code: DetectedLanguageCode;
  label: string;
}>;

const romanizedHindiWords = new Set([
  "hai",
  "hain",
  "nahi",
  "nahin",
  "ka",
  "ki",
  "ke",
  "mein",
  "me",
  "par",
  "pe",
  "se",
  "bahut",
  "paani",
  "pani",
  "sadak",
  "bijli",
  "gadha",
  "gadhe",
  "bade",
  "gaadi",
  "nikalna",
  "mushkil",
  "kachra",
  "kab",
  "kya",
  "koi",
  "raha",
  "rahi",
  "rahe",
  "hum",
  "aap",
  "ko",
  "ho",
  "tha",
  "thi",
]);

const labels: Record<DetectedLanguageCode, string> = {
  en: "English",
  hi: "Hindi",
  "hi-Latn": "Hinglish",
  bn: "Bengali",
  pa: "Punjabi",
  gu: "Gujarati",
  or: "Odia",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
};

export function detectLanguage(text: string): LanguageDetection {
  const counts = new Map<DetectedLanguageCode, number>();
  let letterCount = 0;
  let romanizedHindiConfidence = 0;
  // The script table is fixed-size, so scanning each input code point is O(L).
  for (const character of text) {
    if (!/\p{L}/u.test(character)) continue;
    const point = character.codePointAt(0);
    if (point === undefined) continue;
    const definition = scriptDefinitions.find(
      (script) => point >= script.start && point <= script.end,
    );
    if (!definition) continue;
    counts.set(definition.code, (counts.get(definition.code) ?? 0) + 1);
    letterCount += 1;
  }

  let winner: DetectedLanguageCode = "en";
  let winningCount = 0;
  for (const [code, count] of counts) {
    if (count > winningCount) {
      winner = code;
      winningCount = count;
    }
  }

  if (winner === "en" && letterCount > 0) {
    const tokens = text.toLocaleLowerCase("en").match(/[a-z]+/g) ?? [];
    const matches = tokens.filter((token) => romanizedHindiWords.has(token)).length;
    if (matches >= Math.max(2, Math.ceil(tokens.length * 0.25))) {
      winner = "hi-Latn";
      winningCount = matches;
      romanizedHindiConfidence = matches / tokens.length;
    }
  }

  return {
    code: winner,
    label: labels[winner],
    confidence:
      letterCount === 0
        ? 0
        : winner === "hi-Latn"
          ? romanizedHindiConfidence
          : winningCount / letterCount,
  };
}

export function countLetters(text: string): number {
  let count = 0;
  for (const character of text) {
    if (/\p{L}/u.test(character)) count += 1;
  }
  return count;
}
