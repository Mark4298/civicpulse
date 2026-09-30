import { useEffect, useState } from "react";

export type DetectedLanguage = "en" | "hi" | "pt" | "ru" | "zh";

const languageNames: Record<DetectedLanguage, string> = {
  en: "English",
  hi: "हिन्दी",
  pt: "Português",
  ru: "Русский",
  zh: "中文",
};

function detectLanguage(text: string): DetectedLanguage {
  if (/[\u0900-\u097f]/u.test(text)) return "hi";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru";
  if (/[\u3400-\u9fff]/u.test(text)) return "zh";
  if (/[ãõáâàéêíóôúç]/iu.test(text) || /\b(rua|água|buraco|lixo|saúde|energia)\b/iu.test(text)) {
    return "pt";
  }
  return "en";
}

export function useDebouncedLanguage(text: string): {
  code: DetectedLanguage;
  label: string;
  isChecking: boolean;
} {
  const [language, setLanguage] = useState<DetectedLanguage>("en");
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!text.trim()) {
      setLanguage("en");
      setIsChecking(false);
      return;
    }
    setIsChecking(true);
    const timer = window.setTimeout(() => {
      setLanguage(detectLanguage(text));
      setIsChecking(false);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text]);

  return { code: language, label: languageNames[language], isChecking };
}
