import { ApplicationStatus, APPLICATION_STATUSES } from "../models/Application";
import { DETECTED_CAREER_STATUSES, DetectedCareerStatus } from "../models/CareerEmail";

export { DETECTED_CAREER_STATUSES };
export type { DetectedCareerStatus };

// Confidence thresholds for Gmail-derived career-status detection.
// HIGH: explicit, unambiguous signal -> may auto-advance the application's status.
// MEDIUM: plausible signal -> may surface in the UI/timeline but never changes status.
export const HIGH_CONFIDENCE = 0.8;
export const MEDIUM_CONFIDENCE = 0.5;

/**
 * Forward-only transitions Gmail detection may apply automatically.
 *
 * Invariants enforced here:
 * - "withdrawn" is terminal: it can never be set or changed automatically.
 * - "applied" is never set from Gmail (only the explicit execution flow sets it)
 *   and is therefore never an auto-trigger itself; being already "applied" just
 *   allows forward progress.
 * - rejected/offer are terminal detection targets; no backward moves.
 */
export const ALLOWED_AUTO_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  saved: ["screening", "interview", "offer", "rejected"],
  applied: ["screening", "interview", "offer", "rejected"],
  screening: ["interview", "offer", "rejected"],
  interview: ["offer", "rejected"],
  offer: [],
  rejected: [],
  withdrawn: [],
};

export function isAllowedStatusTransition(
  from: ApplicationStatus,
  to: ApplicationStatus
): boolean {
  if (from === to) return false;
  const allowed = ALLOWED_AUTO_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function isDetectedStatusTarget(status: string | null | undefined): status is DetectedCareerStatus {
  if (!status) return false;
  return (DETECTED_CAREER_STATUSES as readonly string[]).includes(status);
}

export function isAutoTransitionAllowed(
  from: ApplicationStatus,
  to: DetectedCareerStatus
): boolean {
  return isAllowedStatusTransition(from, to);
}

/** Allowed targets for any current status (used to double-check table integrity at test time). */
export function getAllowedTargets(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const status of APPLICATION_STATUSES) {
    out[status] = ALLOWED_AUTO_TRANSITIONS[status];
  }
  return out;
}