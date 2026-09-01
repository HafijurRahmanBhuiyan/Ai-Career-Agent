import { z } from "zod";

/**
 * (Phase 2, Step 3) Strict Zod schema for AI-derived resume evidence.
 * AI output is never trusted; it must pass here before it is persisted or
 * forwarded to matching. The `extraction` metadata block is applied by the
 * caller (not accepted from the model).
 */
export const resumeEvidenceSchema = z.object({
  summary: z.string().nullish(),
  skills: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
  employers: z.array(z.string()).default([]),
  yearsExperience: z.number().finite().min(0).nullish(),
  projects: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  education: z
    .array(
      z.object({
        degree: z.string().nullish(),
        institution: z.string().nullish(),
        field: z.string().nullish(),
      })
    )
    .default([]),
  certifications: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
});

export type ValidatedResumeEvidence = z.infer<typeof resumeEvidenceSchema>;

export function validateResumeEvidence(data: unknown): {
  success: true;
  data: ValidatedResumeEvidence;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = resumeEvidenceSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Resume evidence validation failed",
    details,
  };
}
