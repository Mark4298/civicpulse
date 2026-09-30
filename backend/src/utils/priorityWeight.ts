import type { Complaint } from "@civicpulse/shared";

/**
 * Computes the effective severity score for a complaint based on AI severity and user inputs.
 * Time complexity: O(1)
 */
export function computeEffectiveSeverity(
  aiSeverity: number,
  urgency?: Complaint["urgency"],
  affectedScale?: Complaint["affectedScale"],
  duration?: Complaint["duration"],
): number {
  if (!urgency && !affectedScale && !duration) {
    return aiSeverity;
  }

  const urgencyScore = urgency === "emergency" ? 5 : urgency === "high" ? 4 : urgency === "medium" ? 2 : 1;
  const affectedScore = affectedScale === "wide_area" ? 5 : affectedScale === "neighbourhood" ? 4 : affectedScale === "street" ? 2 : 1;
  const durationScore = duration === "over_6_months" ? 5 : duration === "1_to_6_months" ? 4 : duration === "1_to_4_weeks" ? 2 : 1;

  const score = Math.round(
    0.4 * aiSeverity + 0.3 * urgencyScore + 0.2 * affectedScore + 0.1 * durationScore
  );

  return Math.max(1, Math.min(5, score));
}
