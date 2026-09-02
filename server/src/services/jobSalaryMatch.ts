/**
 * Deterministic salary-range compatibility.
 *
 * Pure, unit-testable helpers for measuring how well a job's salary range
 * overlaps a user's expected salary range. No currency or period conversion
 * is performed: comparisons happen only when currency and salary period are
 * considered compatible.
 */

export type SalaryOverlapKind =
  | "strong"
  | "partial"
  | "none"
  | "unknown";

export interface SalaryCompatibilityInput {
  /** User's expected salary minimum (e.g. yearly low). */
  userMin?: number | null;
  /** User's expected salary maximum (e.g. yearly high). */
  userMax?: number | null;
  /** User's expected currency (3-letter code, e.g. USD). */
  userCurrency?: string | null;
  /** Job's salary minimum. */
  jobMin?: number | null;
  /** Job's salary maximum. */
  jobMax?: number | null;
  /** Job's salary currency. */
  jobCurrency?: string | null;
  /** Job's salary period. */
  jobPeriod?: string | null;
}

export interface SalaryCompatibilityResult {
  kind: SalaryOverlapKind;
  /** Normalized overlap score in [0,1]; 0 when kind is "unknown". */
  ratio: number;
  note: string;
  /** Whether the two ranges could actually be compared. */
  comparable: boolean;
}

function isNonNegativeNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * A salary is comparable only when:
 *  - the user has at least one expected bound and the job has at least one
 *    provided bound, and
 *  - currencies are known on both sides and equal (case-insensitive), and
 *  - the salary periods are compatible (both treated as annual, or the job
 *    explicitly reports an annual/yearly period). Non-annual periods such as
 *    monthly/hourly/contract cannot be safely compared to the (annual)
 *    user expectation, so they yield "unknown" rather than a misleading score.
 */
export function salaryRangesComparable(
  user: Pick<SalaryCompatibilityInput, "userMin" | "userMax" | "userCurrency">,
  job: Pick<SalaryCompatibilityInput, "jobMin" | "jobMax" | "jobCurrency" | "jobPeriod">
): boolean {
  const hasUserRange = isNonNegativeNumber(user.userMin) || isNonNegativeNumber(user.userMax);
  const hasJobRange = isNonNegativeNumber(job.jobMin) || isNonNegativeNumber(job.jobMax);
  if (!hasUserRange || !hasJobRange) return false;

  const userCur = (user.userCurrency || "").trim().toUpperCase();
  const jobCur = (job.jobCurrency || "").trim().toUpperCase();
  if (!userCur || !jobCur || userCur !== jobCur) return false;

  const period = (job.jobPeriod || "").trim().toLowerCase();
  if (period === "monthly" || period === "hourly" || period === "contract") {
    return false;
  }
  return true;
}

/**
 * Compute the overlap between two (non-empty) annual ranges. Open-ended ranges
 * (missing min/max) are handled safely:
 *  - a missing lower bound behaves as -Infinity for overlap detection;
 *  - a missing upper bound behaves as +Infinity for overlap detection.
 *
 * The returned ratio measures the overlap relative to the smaller of the two
 * range widths, clamped to [0,1]. When a denominator cannot be derived (both
 * ranges are open-ended), a coarse 0/.5/1 signal is returned based purely on
 * whether any overlap exists.
 */
export function computeSalaryOverlap(
  user: Pick<SalaryCompatibilityInput, "userMin" | "userMax" | "userCurrency">,
  job: Pick<SalaryCompatibilityInput, "jobMin" | "jobMax" | "jobCurrency" | "jobPeriod">
): SalaryCompatibilityResult {
  if (!salaryRangesComparable(user, job)) {
    return {
      kind: "unknown",
      ratio: 0,
      note: "Salary compatibility is unknown (missing, currency, or period information)",
      comparable: false,
    };
  }

  const uLo = isNonNegativeNumber(user.userMin) ? user.userMin : -Infinity;
  const uHi = isNonNegativeNumber(user.userMax) ? user.userMax : Infinity;
  const jLo = isNonNegativeNumber(job.jobMin) ? job.jobMin : -Infinity;
  const jHi = isNonNegativeNumber(job.jobMax) ? job.jobMax : Infinity;

  const lo = Math.max(uLo, jLo);
  const hi = Math.min(uHi, jHi);
  const hasOverlap = hi >= lo;
  const overlapWidth = hasOverlap ? hi - lo : 0;

  const userWidth =
    isNonNegativeNumber(user.userMin) && isNonNegativeNumber(user.userMax)
      ? user.userMax - user.userMin
      : null;
  const jobWidth =
    isNonNegativeNumber(job.jobMin) && isNonNegativeNumber(job.jobMax)
      ? job.jobMax - job.jobMin
      : null;

  let ratio: number;
  const availableWidths = [userWidth, jobWidth].filter(
    (w): w is number => w !== null && w > 0
  );
  const denominator = availableWidths.length > 0 ? Math.min(...availableWidths) : null;

  if (!hasOverlap) {
    ratio = 0;
  } else if (denominator !== null) {
    ratio = Math.min(1, overlapWidth / denominator);
  } else if (overlapWidth === Infinity) {
    ratio = 0.5;
  } else {
    ratio = overlapWidth > 0 ? 0.5 : 0;
  }

  const kind: SalaryOverlapKind =
    ratio <= 0 ? "none" : ratio >= 0.75 ? "strong" : "partial";

  const note =
    kind === "strong"
      ? "Salary range strongly overlaps your expectations"
      : kind === "partial"
      ? "Salary range partially overlaps your expectations"
      : "Salary range does not overlap your expectations";

  return { kind, ratio, note, comparable: true };
}

/** Convert a normalized overlap ratio to an earned score within a segment. */
export function salaryOverlapToEarned(result: SalaryCompatibilityResult): number {
  return result.comparable ? result.ratio : 0;
}
