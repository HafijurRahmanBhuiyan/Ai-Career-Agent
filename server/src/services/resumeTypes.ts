/**
 * (Phase 2, Step 3) Resume/CV content types.
 *
 * CV and Resume are the same underlying concept (a single Resume model). This
 * file describes the bounded, structured career evidence derived from an
 * uploaded resume document. It is intentionally separate from the trusted
 * structured Profile/Skill/Experience/Education/Project data — resume-derived
 * evidence SUPPLEMENTS (never overwrites) that trusted data.
 */

export type ResumeExtractionStatus =
  | "extracted"
  | "unsupported"
  | "empty"
  | "failed";

export interface ResumeExtractionResult {
  /** Bounded extracted plain text (server-side only; never sent to the matcher as raw text). */
  text: string;
  metadata: {
    format: "pdf" | "docx" | "doc" | "unknown";
    length: number;
    truncated: boolean;
  };
  extractionStatus: ResumeExtractionStatus;
}

/** Structured career evidence derived from a resume document. */
export interface ResumeDerivedEvidence {
  summary?: string | null;
  skills: string[];
  technologies: string[];
  roles: string[];
  employers: string[];
  /** Numeric years only when the resume explicitly states a threshold (e.g. "5+ years"). */
  yearsExperience?: number | null;
  projects: string[];
  achievements: string[];
  education: Array<{
    degree?: string | null;
    institution?: string | null;
    field?: string | null;
  }>;
  certifications: string[];
  domains: string[];
  extraction: {
    status: ResumeExtractionStatus;
    source: "deterministic" | "ai";
    extractedAt: string;
  };
}

export function emptyResumeEvidence(
  status: ResumeExtractionStatus,
  extractedAt = new Date()
): ResumeDerivedEvidence {
  return {
    summary: null,
    skills: [],
    technologies: [],
    roles: [],
    employers: [],
    yearsExperience: null,
    projects: [],
    achievements: [],
    education: [],
    certifications: [],
    domains: [],
    extraction: {
      status,
      source: "deterministic",
      extractedAt: extractedAt.toISOString(),
    },
  };
}
