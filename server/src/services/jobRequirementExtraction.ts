import { ClaudeService } from "../integrations/claude/claude.service";
import {
  emptyJobRequirements,
  validateJobRequirements,
  JobRequirements,
} from "../validators/jobRequirements";

/**
 * (Phase 2, Step 3) Structured job-requirement extraction from a real job
 * description. Two layers:
 *   - deterministic keywords/regex parsing as a safe, non-throwing baseline, and
 *   - an optional, Zod-validated AI pass that upgrades the result.
 *
 * Nothing is ever fabricated; ambiguity falls back to null/empty and the
 * `unavailable` flag lets callers treat the whole requirement set as neutral.
 */

const claudeService = new ClaudeService();

export const MAX_JOB_DESCRIPTION_FOR_REQUIREMENTS = 10000;

const REMOTE_TYPES: Array<{ key: "remote" | "hybrid" | "onsite"; terms: string[] }> = [
  { key: "remote", terms: ["remote", "fully remote", "work from home", "wfh"] },
  { key: "hybrid", terms: ["hybrid", "partially remote"] },
  { key: "onsite", terms: ["onsite", "on-site", "in-office", "in office"] },
];

const EMPLOYMENT_TERMS: Array<{ key: string; terms: string[] }> = [
  { key: "full-time", terms: ["full-time", "full time", "fulltime"] },
  { key: "part-time", terms: ["part-time", "part time", "parttime"] },
  { key: "contract", terms: ["contract", "contractor", "freelance"] },
  { key: "internship", terms: ["internship", "intern"] },
  { key: "temporary", terms: ["temporary", "temp"] },
];

const EXPERIENCE_LEVELS: Array<{ key: string; terms: string[] }> = [
  { key: "entry", terms: ["entry level", "entry-level", "junior", "graduate"] },
  { key: "mid", terms: ["mid level", "mid-level", "intermediate", "3+ years", "3 plus years"] },
  { key: "senior", terms: ["senior", "5+ years", "5 plus years"] },
  { key: "lead", terms: ["lead", "principal", "staff"] },
  { key: "manager", terms: ["manager", "management"] },
];

function detectRemote(textLower: string): JobRequirements["remote"] {
  for (const r of REMOTE_TYPES) {
    for (const term of r.terms) {
      if (textLower.includes(term)) {
        return { type: r.key };
      }
    }
  }
  return null;
}

function detectEmployment(textLower: string): string[] {
  const found: string[] = [];
  for (const e of EMPLOYMENT_TERMS) {
    if (e.terms.some((t) => textLower.includes(t))) {
      found.push(e.key);
    }
  }
  return found;
}

function detectExperience(text: string): JobRequirements["experience"] {
  const textLower = text.toLowerCase();
  let years: number | null = null;
  const yearsMatch = text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)(?:\s+of)?\s+experience/i);
  if (yearsMatch) {
    const n = parseInt(yearsMatch[1], 10);
    if (Number.isFinite(n)) years = n;
  }
  let level: string | null = null;
  for (const l of EXPERIENCE_LEVELS) {
    if (l.terms.some((t) => textLower.includes(t))) {
      level = l.key;
      break;
    }
  }
  if (years == null && level == null) return null;
  return { years, level };
}

function detectEducation(text: string): JobRequirements["education"] {
  let degree: string | null = null;
  let field: string | null = null;

  const degreeMatch = text.match(
    /(Bachelor(?:'s| of [A-Za-z]+)?|B\.?S\.?|B\.?A\.?|Master(?:'s| of [A-Za-z]+)?|M\.?S\.?|M\.?B\.?A\.?|Ph\.?D\.?|Doctorate|Associate(?:'s| degree)?)/i
  );
  if (degreeMatch) degree = degreeMatch[0].trim();

  const FIELD_PATTERN =
    /\bin\s+(Computer Science|Computer Engineering|Information Technology|Information Systems|Software Engineering|Data Science|Data Engineering|Electrical Engineering|Mechanical Engineering|Business Administration|Business|Accounting|Finance|Mathematics|Marketing|related field)\b/i;
  const fieldMatch = text.match(FIELD_PATTERN);
  if (fieldMatch) field = fieldMatch[1].trim();

  if (!degree && !field) return null;
  return { degree, field };
}

function detectSalary(text: string): JobRequirements["salary"] {
  const rangeMatch = text.match(
    /\$\s*([\d,]+)\s*(?:-|–|to)\s*\$?\s*([\d,]+)\s*(k|K|thousand)?/i
  );
  if (!rangeMatch) return null;
  const num = (s: string) => {
    const n = parseFloat(s.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    const suffix = rangeMatch[3] || "";
    return suffix.toLowerCase() === "k" ? n * 1000 : n;
  };
  const min = num(rangeMatch[1]);
  const max = num(rangeMatch[2]);
  if (min == null && max == null) return null;
  let period: string | null = null;
  if (/per year|annual|yearly|/i.test(text) && /year/i.test(text)) period = "yearly";
  else if (/per hour|hourly/i.test(text)) period = "hourly";
  else if (/per month|monthly/i.test(text)) period = "monthly";
  return { min, max, currency: "$", period };
}

type IntentBullets = Pick<
  JobRequirements,
  "required" | "preferred" | "other"
>;

function splitIntentBullets(text: string): IntentBullets {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const required: string[] = [];
  const preferred: string[] = [];
  const other: string[] = [];

  let section: "required" | "preferred" | "other" | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Section headings switch the active bucket for subsequent bullets.
    if (/\brequirements?\s*[:$]|\bqualifications?\s*[:$]|\bmust have\b|\bessential\b/i.test(lower)) {
      section = "required";
      continue;
    }
    if (/\bpreferred\s*[:$]|\bnice to have\b|\bnice-to-have\b|\bbonus\b|\bplus\b/i.test(lower)) {
      section = "preferred";
      continue;
    }
    if (/^(responsibilities|about the role|the role)\s*[:$]|^benefits?\s*[:$]/i.test(lower)) {
      section = "other";
      continue;
    }

    const isBullet = /^[-*•\d.)\s]+/.test(line);
    const clean = line.replace(/^[-*•\d.)\s]+/, "").trim();
    if (!clean) continue;

    // Inline keyword confidence on the content itself.
    const content =
      /(must have|must-have|required|essential|minimum)/i.test(lower) ||
      section === "required";
    const nice =
      /(preferred|nice to have|nice-to-have|bonus|plus|a plus)/i.test(lower) ||
      section === "preferred";

    if (content && (section === "required" || /(must have|must-have|required|essential)/i.test(lower))) {
      required.push(clean);
    } else if (nice && (section === "preferred" || /(preferred|nice to have|nice-to-have|bonus|plus)/i.test(lower))) {
      preferred.push(clean);
    } else if (isBullet || section) {
      other.push(clean);
    }
  }

  const cap = (arr: string[], n: number) => {
    return arr
      .filter((s) => s.length >= 3 && s.length <= 200)
      .slice(0, n);
  };

  return {
    required: cap(required, 15),
    preferred: cap(preferred, 10),
    other: cap(other, 8),
  };
}

/**
 * Deterministic, non-throwing structured requirement extraction.
 */
export function deriveJobRequirementsFromDescription(
  description: string
): JobRequirements {
  const text = String(description || "");
  const textLower = text.toLowerCase();
  const trimmed = text.trim();

  if (!trimmed || trimmed.length < 20) {
    return emptyJobRequirements();
  }

  const intents = splitIntentBullets(text);
  const remote = detectRemote(textLower);
  const employment = detectEmployment(textLower);
  const experience = detectExperience(text);
  const education = detectEducation(text);
  const salary = detectSalary(text);

  const reqs: JobRequirements = {
    required: intents.required,
    preferred: intents.preferred,
    technologies: [],
    experience,
    education,
    location: null,
    remote,
    employment,
    salary,
    other: intents.other,
    unavailable: false,
  };

  return reqs;
}

/**
 * Optional AI structured extraction with cross-provider fallback. Returns null
 * (never throws) when the AI is unavailable or its Zod-validated output is
 * invalid, so the deterministic result remains the safe fallback.
 */
export async function deriveJobRequirementsWithAI(
  description: string,
  preferredProvider?: Parameters<ClaudeService["analyzeResumeEvidence"]>[1]
): Promise<JobRequirements | null> {
  try {
    if (!description || !description.trim()) return null;
    const raw = await claudeService.analyzeJobRequirements(
      String(description).slice(0, MAX_JOB_DESCRIPTION_FOR_REQUIREMENTS),
      preferredProvider
    );
    const validation = validateJobRequirements(raw);
    if (!validation.success) return null;
    return validation.data;
  } catch {
    return null;
  }
}

/**
 * Best available requirements for a description: deterministic baseline,
 * upgraded to validated AI output when available. Never throws.
 */
export async function deriveJobRequirements(
  description: string,
  preferredProvider?: Parameters<ClaudeService["analyzeResumeEvidence"]>[1]
): Promise<JobRequirements> {
  const det = deriveJobRequirementsFromDescription(description);
  if (det.unavailable) return det;
  const ai = await deriveJobRequirementsWithAI(description, preferredProvider);
  return ai ?? det;
}

export { emptyJobRequirements };
