import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import type { Complaint } from "@civicpulse/shared";

interface ResultConfirmationProps {
  complaint: Complaint;
  onNewReport: () => void;
}

const categoryNames: Record<Complaint["category"], string> = {
  roads: "Roads & potholes",
  water: "Water supply",
  electricity: "Electricity & streetlights",
  sanitation: "Sanitation & garbage",
  healthcare: "Healthcare",
  internet: "Internet",
  drainage: "Drainage & sewage",
  education: "Education",
  transport: "Public transport",
  safety: "Public safety",
  other: "Other",
};

export function ResultConfirmation({ complaint, onNewReport }: ResultConfirmationProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section
      className="result-card glass-panel"
      role="status"
      aria-live="polite"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.35 }}
    >
      <div className="result-heading">
        <div className="success-mark" aria-hidden="true">
          <svg viewBox="0 0 44 44" className="success-check">
            <motion.path
              d="M12 23.5 19 30l14-16"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.4, delay: reducedMotion ? 0 : 0.1 }}
            />
          </svg>
        </div>
        <div>
          <span className="step-label">REPORT RECEIVED</span>
          <h3>We heard you.</h3>
          <p>Your report is now part of the picture.</p>
        </div>
      </div>
      <div className="result-details">
        <div className="result-category">
          <span>Category</span>
          <strong>{categoryNames[complaint.category]}</strong>
        </div>
        <div className="severity-block">
          <div className="severity-label">
            <span>Reported urgency</span>
            <strong>{complaint.severity} / 5</strong>
          </div>
          <div
            className="severity-track"
            role="meter"
            aria-label="Reported urgency"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={complaint.severity}
          >
            <motion.span
              className="severity-fill"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: complaint.severity / 5 }}
              transition={{ duration: reducedMotion ? 0 : 0.7, delay: 0.12, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
      <div className="result-footer">
        <span>
          Report ID <code>{complaint.id.slice(0, 8)}</code>
        </span>
        <button type="button" className="text-action" onClick={onNewReport}>
          <RotateCcw size={15} /> New report <ArrowRight size={15} />
        </button>
      </div>
      <Check className="result-watermark" aria-hidden="true" />
    </motion.section>
  );
}
