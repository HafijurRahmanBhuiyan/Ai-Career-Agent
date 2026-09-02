import { z } from "zod";

/**
 * (Phase 2, Step 3) Strict Zod schema for structured job requirements extracted
 * from a real job description. Requirements are never fabricated: any field the
 * description does not explicitly support is left null/empty. `unavailable`
 * flags a description that yields no usable requirements at all so callers can
 * treat the whole requirement set as unknown/neutral rather than penalizing.
 */

export const jobRequirementsSchema = z.object({
  /** Mandatory requirements named in the description (e.g. "5+ years ..."). */
  required: z.array(z.string()).default([]),
  /** Preferred / nice-to-have requirements. */
  preferred: z.array(z.string()).default([]),
  /** Explicit technologies/tools/platforms required or heavily used. */
  technologies: z.array(z.string()).default([]),
  /** Stated experience requirement, if any. */
  experience: z
    .object({
      years: z.number().finite().min(0).nullish(),
      level: z.string().nullish(),
    })
    .nullish(),
  /** Stated education requirement, if any (degree and/or field). */
  education: z
    .object({
      degree: z.string().nullish(),
      field: z.string().nullish(),
    })
    .nullish(),
  /** Stated location requirement, if any. */
  location: z
    .object({
      cities: z.array(z.string()).default([]),
    })
    .nullish(),
  /** Stated remote/hybrid/onsite arrangement, if any. */
  remote: z
    .object({
      type: z.enum(["remote", "hybrid", "onsite"]).nullish(),
    })
    .nullish(),
  /** Stated employment types (full-time/part-time/contract...), if any. */
  employment: z.array(z.string()).default([]),
  /** Stated or derived salary range from the description, if any. */
  salary: z
    .object({
      min: z.number().finite().min(0).nullish(),
      max: z.number().finite().min(0).nullish(),
      currency: z.string().nullish(),
      period: z.string().nullish(),
    })
    .nullish(),
  /** Other explicit requirements that do not fit the above buckets. */
  other: z.array(z.string()).default([]),
  /** Whether the source description provided no reliably extractable requirements. */
  unavailable: z.boolean().default(false),
});

export type JobRequirements = z.infer<typeof jobRequirementsSchema>;

/**
 * An empty / neutral requirement set. Used when no job description exists or it
 * cannot be parsed, so downstream matching never penalizes based on assumptions.
 */
export function emptyJobRequirements(): JobRequirements {
  return {
    required: [],
    preferred: [],
    technologies: [],
    experience: null,
    education: null,
    location: null,
    remote: null,
    employment: [],
    salary: null,
    other: [],
    unavailable: true,
  };
}

export function validateJobRequirements(data: unknown): {
  success: true;
  data: JobRequirements;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = jobRequirementsSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Job requirements validation failed",
    details,
  };
}
