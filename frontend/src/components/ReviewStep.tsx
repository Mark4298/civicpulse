import { useState } from "react";
import { Check, Copy, MapPin, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import type { Complaint, ComplaintCategory, District } from "@civicpulse/shared";
import type { ClassificationPreview } from "../api/client";
import type { Coordinates } from "./LeafletLocationMap";
import { categoryLabels } from "./CategoryChips";

type Urgency = NonNullable<Complaint["urgency"]>;
type AffectedScale = NonNullable<Complaint["affectedScale"]>;
type Duration = NonNullable<Complaint["duration"]>;
const classifierLabels: Record<NonNullable<Complaint["classifiedBy"]>, string> = {
  user: "Manual",
  trie: "Keyword",
  gemini: "AI",
  fallback: "Default",
};

export interface ReviewData {
  text: string;
  voice: File | null;
  category: ComplaintCategory | null;
  categoryPreview?: ClassificationPreview | null;
  urgency: Urgency | "";
  affectedScale: AffectedScale | "";
  duration: Duration | "";
  photos: File[];
  location: Coordinates | null;
  stateName: string;
  districtId: string;
  districtManual: boolean;
  landmark: string;
  isAnonymous: boolean;
  phone: string;
  consent: boolean;
  districts: District[];
}

const urgencyLabels: Record<Urgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  emergency: "Emergency",
};
const scaleLabels: Record<AffectedScale, string> = {
  me: "Just me",
  street: "My street",
  neighbourhood: "Neighbourhood",
  wide_area: "Whole area",
};
const durationLabels: Record<Duration, string> = {
  under_1_week: "Less than a week",
  "1_to_4_weeks": "1 to 4 weeks",
  "1_to_6_months": "1 to 6 months",
  over_6_months: "More than 6 months",
};

interface ReviewStepProps {
  state: ReviewData;
  result?: Complaint;
  isLoggedIn: boolean;
  phoneError?: string;
  consentError?: string;
  onAnonymousChange?: (value: boolean) => void;
  onPhoneChange?: (value: string) => void;
  onConsentChange?: (value: boolean) => void;
  onNewReport?: () => void;
}

export function ReviewStep({
  state,
  result,
  isLoggedIn,
  phoneError = "",
  consentError = "",
  onAnonymousChange,
  onPhoneChange,
  onConsentChange,
  onNewReport,
}: ReviewStepProps) {
  const reducedMotion = useReducedMotion();
  const [copyStatus, setCopyStatus] = useState("");
  const district = state.districts.find((item) => item.id === state.districtId);

  async function copyReference(referenceId: string) {
    try {
      await navigator.clipboard.writeText(referenceId);
      setCopyStatus("Reference ID copied.");
    } catch {
      setCopyStatus("Could not copy automatically; select the reference ID to copy it.");
    }
  }

  if (result) {
    const referenceId = result.referenceId || result.id;
    return (
      <div className="grid justify-items-center gap-5 text-center" role="status" aria-live="polite">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.35 }}
          aria-hidden="true"
        >
          <Check size={32} strokeWidth={2.5} />
        </motion.div>
        <div>
          <p className="step-label">REPORT RECEIVED</p>
          <h2 className="mb-0 mt-2 text-xl font-semibold text-white">Thank you for speaking up</h2>
        </div>
        <div className="grid w-full gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
          <span className="text-xs uppercase tracking-wide text-slate-400">Reference ID</span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-h-11 flex-1 content-center break-all rounded-lg bg-slate-950/50 px-3 text-sm text-cyan-100">
              {referenceId}
            </code>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              onClick={() => void copyReference(referenceId)}
              aria-label="Copy reference ID"
            >
              <Copy size={15} /> Copy
            </button>
          </div>
          <span role="status" className="min-h-4 text-xs text-slate-300">
            {copyStatus}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="w-fit rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
              {categoryLabels[result.category]}
            </span>
            <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
              {classifierLabels[result.classifiedBy ?? "fallback"]}
            </span>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>Severity</span>
              <span>{result.severity} / 5</span>
            </div>
            <div
              className="flex gap-1"
              role="meter"
              aria-label={`Severity ${result.severity} out of 5`}
              aria-valuemin={1}
              aria-valuemax={5}
              aria-valuenow={result.severity}
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <span
                  key={level}
                  className={`h-2 flex-1 rounded-full ${level <= result.severity ? "bg-cyan-300" : "bg-white/10"}`}
                />
              ))}
            </div>
          </div>
        </div>
        {isLoggedIn ? (
          <Link
            className="min-h-11 content-center rounded-xl bg-cyan-300 px-5 font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            to="/my-reports"
          >
            Track this report
          </Link>
        ) : (
          <Link
            className="min-h-11 content-center text-sm text-cyan-200 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            to="/login"
          >
            Sign in to track your reports
          </Link>
        )}
        <button
          type="button"
          className="min-h-11 rounded-xl border border-white/15 px-5 text-sm text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          onClick={onNewReport}
        >
          Submit another report
        </button>
      </div>
    );
  }

  const reviewCategory = state.category ?? state.categoryPreview?.category ?? null;
  const reviewClassifier = state.category
    ? "Manual"
    : state.categoryPreview?.classifiedBy === "trie"
      ? "Keyword"
      : state.categoryPreview?.category
        ? "AI"
        : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="mt-1 shrink-0 text-cyan-200" aria-hidden="true" />
          <p className="m-0 whitespace-pre-wrap break-words text-sm text-slate-100">
            {state.text.trim() ||
              (state.voice ? `Voice recording: ${state.voice.name}` : "No description provided")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-cyan-100">
            {reviewCategory ? categoryLabels[reviewCategory] : "Let AI decide"}
          </span>
          {reviewClassifier && (
            <span className="rounded-full border border-white/10 px-3 py-1 text-slate-200">
              {reviewClassifier}
            </span>
          )}
          {state.urgency && (
            <span className="rounded-full border border-white/15 px-3 py-1 text-slate-100">
              {urgencyLabels[state.urgency]} urgency
            </span>
          )}
          {state.affectedScale && (
            <span className="rounded-full border border-white/15 px-3 py-1 text-slate-100">
              {scaleLabels[state.affectedScale]}
            </span>
          )}
          {state.duration && (
            <span className="rounded-full border border-white/15 px-3 py-1 text-slate-100">
              {durationLabels[state.duration]}
            </span>
          )}
        </div>
        <div className="flex items-start gap-2 text-sm text-slate-300">
          <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {district
              ? `${district.name}, ${state.stateName}`
              : state.stateName || "Location pinned"}
            {state.landmark.trim() && <> · Near {state.landmark.trim()}</>}
            {state.location && (
              <>
                {" "}
                ({state.location.lat.toFixed(4)}, {state.location.lng.toFixed(4)})
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          {state.isAnonymous && (
            <span className="rounded-full border border-white/10 px-2 py-1">Anonymous report</span>
          )}
          {state.phone && (
            <span className="rounded-full border border-white/10 px-2 py-1">
              Contact: +91 {state.phone}
            </span>
          )}
        </div>
        {state.photos.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            aria-label={`${state.photos.length} attached photos`}
          >
            {state.photos.map((photo, index) => (
              <span
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300"
                key={`${photo.name}-${index}`}
              >
                {photo.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-slate-100">
        <input
          className="h-5 w-5 accent-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          type="checkbox"
          checked={state.isAnonymous}
          onChange={(event) => {
            const nextValue = event.target.checked;
            onAnonymousChange?.(nextValue);
            if (nextValue) onPhoneChange?.("");
          }}
        />
        Hide my name and phone from officials
      </label>
      <p className="m-0 text-xs text-slate-400">
        You still need to be signed in so you can track this report.
      </p>
      <label className="grid gap-2 text-sm text-slate-200">
        Phone number <span className="text-xs text-slate-400">Optional</span>
        <span className="flex min-h-12 items-center rounded-xl border border-white/15 bg-slate-950/50 focus-within:outline focus-within:outline-2 focus-within:outline-cyan-300">
          <span className="border-r border-white/10 px-3 text-slate-300" aria-hidden="true">
            +91
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent px-3 text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:text-slate-500"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            value={state.isAnonymous ? "" : state.phone}
            onChange={(event) => onPhoneChange?.(event.target.value.replace(/\D/g, ""))}
            placeholder="10-digit mobile number"
            aria-label="Optional 10-digit mobile number"
            aria-invalid={Boolean(phoneError)}
            disabled={state.isAnonymous}
          />
        </span>
      </label>
      {phoneError && (
        <p className="m-0 text-sm text-rose-200" role="alert">
          {phoneError}
        </p>
      )}
      <label className="flex min-h-12 items-start gap-3 text-sm text-slate-200">
        <input
          className="mt-0.5 h-5 w-5 shrink-0 accent-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          type="checkbox"
          checked={state.consent}
          onChange={(event) => onConsentChange?.(event.target.checked)}
          aria-invalid={Boolean(consentError)}
        />
        <span>I confirm this report is true to the best of my knowledge.</span>
      </label>
      {consentError && (
        <p className="m-0 text-sm text-rose-200" role="alert">
          {consentError}
        </p>
      )}
      {!state.consent && !consentError && (
        <p className="m-0 text-xs text-slate-400">
          Confirm the statement above to enable submission.
        </p>
      )}
    </div>
  );
}
