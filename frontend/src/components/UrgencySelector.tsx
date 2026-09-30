import type { Complaint } from "@civicpulse/shared";

type Urgency = NonNullable<Complaint["urgency"]>;

const choices: Array<{ value: Urgency; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "emergency", label: "Emergency" },
];

interface UrgencySelectorProps {
  value: Urgency | "";
  onChange: (urgency: Urgency) => void;
}

export function UrgencySelector({ value, onChange }: UrgencySelectorProps) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      role="radiogroup"
      aria-label="Report urgency"
    >
      {choices.map(({ value: urgency, label }) => (
        <button
          key={urgency}
          type="button"
          role="radio"
          aria-checked={value === urgency}
          onClick={() => onChange(urgency)}
          className={`min-h-14 rounded-xl border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
            value === urgency
              ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100"
              : "border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"
          }`}
        >
          {label}
        </button>
      ))}
      {value === "emergency" && (
        <p className="col-span-full m-0 text-xs text-amber-200" role="note">
          For life-threatening situations call 112.
        </p>
      )}
    </div>
  );
}
