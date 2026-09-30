import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, AudioLines, MapPin } from "lucide-react";
import type { ComplaintLanguage } from "@civicpulse/shared";

const heroPrompts = [
  "How can we help?",
  "हम आपकी मदद कैसे कर सकते हैं?",
  "আপনাদের কীভাবে সাহায্য করতে পারি?",
  "நாங்கள் எவ்வாறு உதவலாம்?",
];

const topicLabels = ["Roads & transit", "Water & power", "Health & access"];
const topicPrompts: Partial<Record<ComplaintLanguage, readonly [string, string, string]>> = {
  en: [
    "There are potholes on the road near my home.",
    "Water supply is unreliable in my area.",
    "The local hospital needs attention.",
  ],
  hi: [
    "मेरे इलाके की सड़क पर गड्ढे हैं।",
    "मेरे इलाके में पानी की आपूर्ति अनियमित है।",
    "स्थानीय अस्पताल में सुविधाओं की कमी है।",
  ],
  bn: [
    "আমাদের এলাকায় রাস্তা খারাপ, গর্ত আছে।",
    "আমাদের এলাকায় পানি সরবরাহ অনিয়মিত।",
    "স্থানীয় হাসপাতাল ও চিকিৎসা সুবিধা দরকার।",
  ],
  ta: [
    "எங்கள் பகுதியில் சாலை மோசமாக உள்ளது, பள்ளம் உள்ளது.",
    "எங்கள் பகுதியில் தண்ணீர் விநியோகம் சீராக இல்லை.",
    "உள்ளூர் மருத்துவமனை மற்றும் சிகிச்சை வசதி தேவை.",
  ],
};

interface HeroProps {
  language: ComplaintLanguage | "auto";
  isLoggedIn?: boolean;
  onSelectTopic: (prompt: string) => void;
}

export function Hero({ language, isLoggedIn = false, onSelectTopic }: HeroProps) {
  const reducedMotion = useReducedMotion();
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedPrompt, setTypedPrompt] = useState(reducedMotion ? heroPrompts[0]! : "");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setTypedPrompt(heroPrompts[promptIndex]!);
      return;
    }

    const current = heroPrompts[promptIndex]!;
    const complete = typedPrompt === current;
    const empty = typedPrompt.length === 0;
    const delay = complete ? 1500 : deleting ? 38 : 74;
    const timer = window.setTimeout(() => {
      if (complete) {
        setDeleting(true);
      } else if (empty && deleting) {
        setDeleting(false);
        setPromptIndex((index) => (index + 1) % heroPrompts.length);
      } else {
        setTypedPrompt(
          deleting
            ? current.slice(0, typedPrompt.length - 1)
            : current.slice(0, typedPrompt.length + 1),
        );
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, promptIndex, reducedMotion, typedPrompt]);

  const selectedLanguage = language === "auto" ? "en" : language;
  const selectedPrompts = topicPrompts[selectedLanguage] ?? topicPrompts.en!;

  return (
    <section className="hero-block" aria-labelledby="hero-title">
      <motion.div
        className="hero-kicker"
        initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.45 }}
      >
        <span className="brand-mark">
          <AudioLines size={17} strokeWidth={2.3} />
        </span>
        <span>Local voices. Public progress.</span>
      </motion.div>

      <motion.h1
        id="hero-title"
        className="hero-title"
        initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.6, delay: reducedMotion ? 0 : 0.08 }}
      >
        Better places
        <br />
        <span className="gradient-text">start with us.</span>
      </motion.h1>

      <div className="typing-line" aria-live="polite" aria-atomic="true">
        <span>{typedPrompt}</span>
        {!reducedMotion && <span className="typing-caret" aria-hidden="true" />}
      </div>

      <p className="hero-copy">
        Tell your city what needs attention. Your report helps communities make everyday
        infrastructure better for everyone.
      </p>

      <div className="hero-signals" aria-label="Report topic starters">
        {topicLabels.map((label, index) => (
          <button
            className="hero-topic"
            type="button"
            key={label}
            onClick={() => onSelectTopic(selectedPrompts[index]!)}
            aria-label={`Add a ${label} report starter`}
          >
            {index === 0 ? (
              <MapPin size={15} />
            ) : (
              <span className={`signal-dot${index === 2 ? " signal-coral" : " signal-cyan"}`} />
            )}
            {label}
          </button>
        ))}
      </div>

      <a
        className="scroll-cue"
        href={isLoggedIn ? "#report-form" : "/login?next=%2F"}
        onClick={(event) => {
          if (!isLoggedIn) return;
          event.preventDefault();
          document.getElementById("report-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        <span className="scroll-cue-icon">
          <ArrowDown size={15} />
        </span>
        <span>Make a report</span>
      </a>
    </section>
  );
}
