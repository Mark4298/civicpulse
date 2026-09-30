import { useRef } from "react";
import type { KeyboardEvent } from "react";
import {
  BookOpen,
  Bus,
  HeartPulse,
  Lightbulb,
  Radio,
  Route,
  Shield,
  Sparkles,
  Trash2,
  Waves,
  Wifi,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComplaintCategory } from "@civicpulse/shared";

interface CategoryOption {
  value: ComplaintCategory | null;
  label: string;
  Icon: LucideIcon;
}

export const categoryLabels: Record<ComplaintCategory, string> = {
  roads: "Roads & potholes",
  water: "Water supply",
  electricity: "Electricity & streetlights",
  sanitation: "Sanitation & garbage",
  drainage: "Drainage & sewage",
  healthcare: "Healthcare",
  education: "Education",
  transport: "Public transport",
  internet: "Internet",
  safety: "Public safety",
  other: "Other",
};

const options: CategoryOption[] = [
  { value: null, label: "Let AI decide", Icon: Sparkles },
  { value: "roads", label: categoryLabels.roads, Icon: Route },
  { value: "water", label: categoryLabels.water, Icon: Waves },
  { value: "electricity", label: categoryLabels.electricity, Icon: Zap },
  { value: "sanitation", label: categoryLabels.sanitation, Icon: Trash2 },
  { value: "drainage", label: categoryLabels.drainage, Icon: Lightbulb },
  { value: "healthcare", label: categoryLabels.healthcare, Icon: HeartPulse },
  { value: "education", label: categoryLabels.education, Icon: BookOpen },
  { value: "transport", label: categoryLabels.transport, Icon: Bus },
  { value: "internet", label: categoryLabels.internet, Icon: Wifi },
  { value: "safety", label: categoryLabels.safety, Icon: Shield },
  { value: "other", label: categoryLabels.other, Icon: Radio },
];

interface CategoryChipsProps {
  value: ComplaintCategory | null;
  suggestedCategory?: ComplaintCategory | null;
  onChange: (category: ComplaintCategory | null) => void;
}

export function CategoryChips({ value, suggestedCategory = null, onChange }: CategoryChipsProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      target = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      target = (index + options.length - 1) % options.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = options.length - 1;
    else return;
    event.preventDefault();
    const option = options[target];
    if (!option) return;
    onChange(option.value);
    buttons.current[target]?.focus();
  }

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      role="radiogroup"
      aria-label="Report category"
    >
      {options.map(({ value: optionValue, label, Icon }, index) => (
        <button
          ref={(element) => {
            buttons.current[index] = element;
          }}
          key={label}
          type="button"
          role="radio"
          aria-checked={value === optionValue}
          aria-label={
            suggestedCategory !== null && suggestedCategory === optionValue
              ? `${label}, AI suggested`
              : label
          }
          tabIndex={value === optionValue ? 0 : -1}
          onClick={() => onChange(optionValue)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 sm:text-sm ${
            value === optionValue
              ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
              : suggestedCategory !== null && suggestedCategory === optionValue
                ? "border-violet-300/60 bg-violet-300/10 text-violet-100"
              : "border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25 hover:bg-white/[0.08]"
          }`}
        >
          <Icon size={17} className="shrink-0" aria-hidden="true" />
          <span>{label}</span>
          {suggestedCategory !== null && suggestedCategory === optionValue && (
            <span className="ml-auto rounded-full border border-violet-300/30 px-2 py-0.5 text-[10px] text-violet-100">
              AI suggested
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
