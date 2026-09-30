import type { ComplaintCategory, ComplaintLanguage } from "@civicpulse/shared";

interface TrieNode {
  children: Map<string, TrieNode>;
  matches: KeywordMatch[];
}

interface KeywordMatch {
  category: ComplaintCategory;
  language: ComplaintLanguage;
  phrase: string;
}

export interface TrieClassification {
  category: ComplaintCategory;
  language: ComplaintLanguage;
  confidence: number;
  summary: string;
}

const terms: Array<[string, ComplaintCategory, ComplaintLanguage]> = [
  ["road", "roads", "en"],
  ["roads", "roads", "en"],
  ["pothole", "roads", "en"],
  ["potholes", "roads", "en"],
  ["gadhe", "roads", "hi"],
  ["gadde", "roads", "hi"],
  ["सड़क", "roads", "hi"],
  ["सड़कों", "roads", "hi"],
  ["गड्ढा", "roads", "hi"],
  ["गड्ढे", "roads", "hi"],
  ["রাস্তা", "roads", "bn"],
  ["সড়ক", "roads", "bn"],
  ["গর্ত", "roads", "bn"],
  ["சாலை", "roads", "ta"],
  ["சாலைகள்", "roads", "ta"],
  ["பள்ளம்", "roads", "ta"],
  ["estrada", "roads", "pt"],
  ["rodovia", "roads", "pt"],
  ["buraco", "roads", "pt"],
  ["buracos", "roads", "pt"],
  ["дорога", "roads", "ru"],
  ["дороги", "roads", "ru"],
  ["яма", "roads", "ru"],
  ["ямы", "roads", "ru"],
  ["water", "water", "en"],
  ["tap", "water", "en"],
  ["पानी", "water", "hi"],
  ["जल", "water", "hi"],
  ["পানি", "water", "bn"],
  ["জল", "water", "bn"],
  ["தண்ணீர்", "water", "ta"],
  ["குடிநீர்", "water", "ta"],
  ["água", "water", "pt"],
  ["abastecimento", "water", "pt"],
  ["вода", "water", "ru"],
  ["водоснабжение", "water", "ru"],
  ["electricity", "electricity", "en"],
  ["power", "electricity", "en"],
  ["outage", "electricity", "en"],
  ["बिजली", "electricity", "hi"],
  ["ऊर्जा", "electricity", "hi"],
  ["streetlight", "electricity", "en"],
  ["streetlights", "electricity", "en"],
  ["streetlight is not working", "electricity", "en"],
  ["street light", "electricity", "en"],
  ["street lights", "electricity", "en"],
  ["বিদ্যুৎ", "electricity", "bn"],
  ["மின்சாரம்", "electricity", "ta"],
  ["மின்வெட்டு", "electricity", "ta"],
  ["energia", "electricity", "pt"],
  ["eletricidade", "electricity", "pt"],
  ["электричество", "electricity", "ru"],
  ["свет", "electricity", "ru"],
  ["sanitation", "sanitation", "en"],
  ["garbage", "sanitation", "en"],
  ["sewer", "sanitation", "en"],
  ["कचरा", "sanitation", "hi"],
  ["स्वच्छता", "sanitation", "hi"],
  ["আবর্জনা", "sanitation", "bn"],
  ["নর্দমা", "sanitation", "bn"],
  ["குப்பை", "sanitation", "ta"],
  ["கழிவு", "sanitation", "ta"],
  ["lixo", "sanitation", "pt"],
  ["esgoto", "sanitation", "pt"],
  ["мусор", "sanitation", "ru"],
  ["канализация", "sanitation", "ru"],
  ["healthcare", "healthcare", "en"],
  ["hospital", "healthcare", "en"],
  ["clinic", "healthcare", "en"],
  ["अस्पताल", "healthcare", "hi"],
  ["स्वास्थ्य", "healthcare", "hi"],
  ["হাসপাতাল", "healthcare", "bn"],
  ["চিকিৎসা", "healthcare", "bn"],
  ["மருத்துவமனை", "healthcare", "ta"],
  ["மருத்துவம்", "healthcare", "ta"],
  ["saúde", "healthcare", "pt"],
  ["clínica", "healthcare", "pt"],
  ["больница", "healthcare", "ru"],
  ["медицина", "healthcare", "ru"],
  ["internet", "internet", "en"],
  ["wifi", "internet", "en"],
  ["broadband", "internet", "en"],
  ["इंटरनेट", "internet", "hi"],
  ["नेटवर्क", "internet", "hi"],
  ["ইন্টারনেট", "internet", "bn"],
  ["নেটওয়ার্ক", "internet", "bn"],
  ["இணையம்", "internet", "ta"],
  ["வலைப்பின்னல்", "internet", "ta"],
  ["internet", "internet", "pt"],
  ["conexão", "internet", "pt"],
  ["интернет", "internet", "ru"],
  ["связь", "internet", "ru"],
];

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

const root: TrieNode = { children: new Map(), matches: [] };
for (const [phrase, category, language] of terms) {
  let node = root;
  for (const character of normalize(phrase)) {
    let child = node.children.get(character);
    if (!child) {
      child = { children: new Map(), matches: [] };
      node.children.set(character, child);
    }
    node = child;
  }
  node.matches.push({ category, language, phrase });
}

const wordCharacter = /[\p{L}\p{N}]/u;

// Trie scans each start position with a bounded keyword maximum, so input work is O(L).
export function classifyByTrie(text: string): TrieClassification | null {
  const normalized = normalize(text);
  const counts = new Map<ComplaintCategory, number>();
  const languages = new Map<ComplaintLanguage, number>();
  const phrases = new Map<ComplaintCategory, string>();

  for (let start = 0; start < normalized.length; start += 1) {
    let node = root;
    for (let end = start; end < normalized.length; end += 1) {
      const character = normalized[end]!;
      const child = node.children.get(character);
      if (!child) break;
      node = child;
      if (node.matches.length === 0) continue;
      const before = start === 0 ? " " : normalized[start - 1]!;
      const after = end === normalized.length - 1 ? " " : normalized[end + 1]!;
      if (wordCharacter.test(before) || wordCharacter.test(after)) continue;
      const match = node.matches[0]!;
      counts.set(match.category, (counts.get(match.category) ?? 0) + 1);
      languages.set(match.language, (languages.get(match.language) ?? 0) + 1);
      phrases.set(match.category, match.phrase);
    }
  }

  const best = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!best) return null;
  const [category, count] = best;
  const language =
    [...languages.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "en";
  return {
    category,
    language,
    confidence: Math.min(0.99, 0.88 + (count - 1) * 0.04),
    summary: `Citizen reported a ${category} issue (${phrases.get(category)}).`,
  };
}

export function detectLanguage(text: string, languageHint?: ComplaintLanguage): ComplaintLanguage {
  if (languageHint) return languageHint;
  if (/[\u0980-\u09ff]/u.test(text)) return "bn";
  if (/[\u0b80-\u0bff]/u.test(text)) return "ta";
  if (/[\u0900-\u097f]/u.test(text)) return "hi";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru";
  return classifyByTrie(text)?.language ?? "en";
}
