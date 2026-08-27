import { z } from "zod";
import { MatchLevel } from "../models/JobMatch";

export const JOB_MATCH_STRONG_MIN = 90;
export const JOB_MATCH_GOOD_MIN = 75;
export const JOB_MATCH_PARTIAL_MIN = 60;

export const jobMatchAIOutputSchema = z.object({
  score: z
    .number()
    .finite("Score must be a finite number")
    .min(0, "Score must be between 0 and 100")
    .max(100, "Score must be between 0 and 100"),
  summary: z.string().min(1, "summary is required"),
  matchingSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  matchingTechnologies: z.array(z.string()).default([]),
  missingTechnologies: z.array(z.string()).default([]),
  experienceMatch: z.string().default(""),
  experienceGap: z.string().default(""),
  educationMatch: z.string().default(""),
  educationGap: z.string().default(""),
  locationMatch: z.string().default(""),
  remoteMatch: z.string().default(""),
  employmentTypeMatch: z.string().default(""),
  salaryMatch: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  recommendation: z.enum(["apply", "maybe", "skip"]).default("maybe"),
  recommendationReason: z.string().default(""),
});

export type JobMatchAIOutput = z.infer<typeof jobMatchAIOutputSchema>;

export function matchLevelFromScore(score: number): MatchLevel {
  if (score >= JOB_MATCH_STRONG_MIN) return "strong_match";
  if (score >= JOB_MATCH_GOOD_MIN) return "good_match";
  if (score >= JOB_MATCH_PARTIAL_MIN) return "partial_match";
  return "weak_match";
}

export function validateJobMatchAIOutput(data: unknown): {
  success: true;
  data: JobMatchAIOutput;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = jobMatchAIOutputSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Job match validation failed",
    details,
  };
}
