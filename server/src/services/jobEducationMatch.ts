/**
 * Deterministic education compatibility.
 *
 * Pure, unit-testable helpers for measuring how well a user's education
 * satisfies a job's explicit education requirement. The matching is deliberately
 * conservative: a job with no explicit requirement (or a requirement that cannot
 * be reliably classified) is treated as unknown/neutral and never penalized.
 */

export type EducationMatchKind =
  | "strong"
  | "mismatch"
  | "unknown";

export interface UserEducationMatchInput {
  degree?: string | null;
  field?: string | null;
}

export interface JobEducationRequirement {
  degree?: string | null;
  field?: string | null;
}

export interface EducationMatchResult {
  kind: EducationMatchKind;
  /** Normalized score in [0,1]; 0 when kind is "unknown". */
  ratio: number;
  note: string;
  /** Whether the requirement could actually be compared against user data. */
  comparable: boolean;
}

/**
 * Recognized degree hierarchy. Only standardized values map to a level; any
 * other degree string is left unclassified (returns null) so that unknown
 * wording never produces a false mismatch.
 *
 *   0 = secondary (high school / diploma / GED)
 *   1 = associate
 *   2 = bachelor's
 *   3 = master's
 *   4 = doctorate (PhD)
 */
export function classifyDegreeLevel(degree: string | null | undefined): number | null {
  const n = (degree || "")
    .toLowerCase()
    .replace(/[^a-z]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!n) return null;

  if (
    n.indexOf("high school") !== -1 ||
    n.indexOf("ged") !== -1 ||
    n.indexOf("diploma") !== -1 ||
    n === "secondary"
  ) {
    return 0;
  }
  if (n.indexOf("associate") !== -1 || n.indexOf("associates") !== -1) {
    return 1;
  }
  if (
    n.indexOf("bachelor") !== -1 ||
    n === "b a" ||
    n === "b s" ||
    n === "bsc" ||
    n === "bs" ||
    n === "ba" ||
    n === "b eng"
  ) {
    return 2;
  }
  if (
    n.indexOf("master") !== -1 ||
    n === "m s" ||
    n === "m a" ||
    n === "msc" ||
    n === "ms" ||
    n === "ma" ||
    n === "mba" ||
    n === "m eng"
  ) {
    return 3;
  }
  if (
    n.indexOf("doctor") !== -1 ||
    n.indexOf("phd") !== -1 ||
    n.indexOf("ph d") !== -1 ||
    n === "dphil"
  ) {
    return 4;
  }

  return null;
}

/**
 * Stop-words stripped from field names before comparison. These are purely
 * structural words (conjunctions/prepositions) that carry no matching signal.
 * Subject words such as "computer", "engineering", or "science" are preserved so
 * that "Computer Science" can meaningfully match "Computer Science & Engineering"
 * while still never matching an unrelated field like "Mechanical Engineering".
 */
const FIELD_STOP_WORDS = new Set([
  "and",
  "or",
  "of",
  "in",
  "with",
  "for",
  "the",
  "studies",
  "study",
  "degree",
]);

function normalizeField(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function fieldTokens(value: string | null | undefined): Set<string> {
  const n = normalizeField(value);
  const tokens = new Set<string>();
  for (const raw of n.split(/[^a-z0-9]+/)) {
    const t = raw.trim();
    if (t.length > 1 && !FIELD_STOP_WORDS.has(t)) {
      tokens.add(t);
    }
  }
  return tokens;
}

/**
 * Fields match when every meaningful token of the required field is present in
 * the candidate field. Empty candidate or empty required-token sets never match
 * (handled by the caller as neutral).
 */
export function fieldsMatch(
  jobField: string | null | undefined,
  userField: string | null | undefined
): boolean {
  const required = fieldTokens(jobField);
  const candidate = fieldTokens(userField);
  if (required.size === 0 || candidate.size === 0) return false;
  for (const t of required) {
    if (!candidate.has(t)) return false;
  }
  return true;
}

function hasDegree(req: JobEducationRequirement): boolean {
  return typeof req.degree === "string" && req.degree.trim().length > 0;
}

function hasField(req: JobEducationRequirement): boolean {
  return typeof req.field === "string" && req.field.trim().length > 0;
}

/**
 * Compute education compatibility.
 *
 *   - No requirement (or an unusable requirement, e.g. an unrecognized degree
 *     wording with no comparable field) -> unknown/neutral.
 *   - A requirement that the user clearly satisfies (degree hierarchy and/or
 *     field) -> strong.
 *   - A clear, reliable shortfall -> mismatch.
 *   - Insufficient user data to establish either -> unknown/neutral.
 *
 * When both a degree and a field requirement are present, the user must satisfy
 * both for a strong result; a clear mismatch on either is a mismatch; otherwise
 * it stays neutral. The strongest applicable user education record is used and
 * not every record needs to match.
 */
export function computeEducationMatch(
  education: UserEducationMatchInput[] | null | undefined,
  requirement: JobEducationRequirement | null | undefined
): EducationMatchResult {
  const req = requirement ?? null;

  // No explicit requirement -> neutral.
  if (!req || (!hasDegree(req) && !hasField(req))) {
    return {
      kind: "unknown",
      ratio: 0,
      note: "This role does not specify a formal education requirement",
      comparable: false,
    };
  }

  const degreeLevel = hasDegree(req) ? classifyDegreeLevel(req.degree) : null;
  const degreeComparable = hasDegree(req) && degreeLevel != null;
  const fieldComparable = hasField(req) && fieldTokens(req.field).size > 0;

  // A stated requirement we cannot reliably classify -> neutral (no penalty).
  if (!degreeComparable && !fieldComparable) {
    return {
      kind: "unknown",
      ratio: 0,
      note: "Education requirement could not be reliably compared",
      comparable: false,
    };
  }

  const records = Array.isArray(education) ? education.filter(Boolean) : [];

  let degreeSatisfied = false;
  let degreeMismatch = false;
  let degreeInfoAvailable = false;

  if (degreeComparable) {
    let best = -1;
    for (const r of records) {
      const lvl = classifyDegreeLevel(r?.degree);
      if (lvl != null) {
        degreeInfoAvailable = true;
        best = Math.max(best, lvl);
      }
    }
    degreeSatisfied = degreeInfoAvailable && best >= degreeLevel;
    degreeMismatch = degreeInfoAvailable && !degreeSatisfied;
  }

  let fieldSatisfied = false;
  let fieldMismatch = false;
  let fieldInfoAvailable = false;

  if (fieldComparable) {
    for (const r of records) {
      if (normalizeField(r?.field)) {
        fieldInfoAvailable = true;
      }
      if (fieldsMatch(req.field, r?.field)) {
        fieldSatisfied = true;
      }
    }
    // A user field exists but none matches -> clear (not just missing) mismatch.
    fieldMismatch = fieldInfoAvailable && !fieldSatisfied;
  }

  const satisfied =
    (!degreeComparable || degreeSatisfied) &&
    (!fieldComparable || fieldSatisfied);

  if (satisfied) {
    return {
      kind: "strong",
      ratio: 1,
      note: buildNote(req, "Education requirement is satisfied by your profile"),
      comparable: true,
    };
  }

  const mismatch =
    (degreeComparable && degreeMismatch) || (fieldComparable && fieldMismatch);

  if (mismatch) {
    return {
      kind: "mismatch",
      ratio: 0,
      note: buildNote(req, "Your education does not meet this role's requirement"),
      comparable: true,
    };
  }

  return {
    kind: "unknown",
    ratio: 0,
    note: "Education compatibility is unknown (insufficient information)",
    comparable: false,
  };
}

function buildNote(req: JobEducationRequirement, fallback: string): string {
  const parts: string[] = [];
  if (hasDegree(req)) parts.push(req.degree?.trim() ?? "");
  if (hasField(req)) parts.push(req.field?.trim() ?? "");
  return parts.length > 0 ? `${fallback}: ${parts.join(" / ")}` : fallback;
}
