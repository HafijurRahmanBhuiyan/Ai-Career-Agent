import { z } from "zod";

export const jobFitAssistOutputSchema = z
  .object({
    overallFit: z
      .enum(["strong", "moderate", "weak", "uncertain"])
      .default("uncertain"),
    summary: z.string().min(1, "summary is required"),
    highlights: z.array(z.string()).default([]),
    gaps: z.array(z.string()).default([]),
    uncertainties: z.array(z.string()).default([]),
    suggestedQuestionsToAskEmployer: z.array(z.string()).default([]),
  })
  .strict();

export type JobFitAssistOutput = z.infer<typeof jobFitAssistOutputSchema>;

export function validateJobFitAssistOutput(data: unknown):
  | { success: true; data: JobFitAssistOutput }
  | { success: false; error: string; details?: string[] } {
  const result = jobFitAssistOutputSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Job fit assist validation failed",
    details,
  };
}
