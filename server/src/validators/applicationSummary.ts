import { z } from "zod";

export const applicationSummaryAIOutputSchema = z.object({
  summary: z.string().min(1, "summary is required"),
  currentSituation: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
});

export type ApplicationSummaryAIOutput = z.infer<
  typeof applicationSummaryAIOutputSchema
>;

export function validateApplicationSummaryAIOutput(data: unknown): {
  success: true;
  data: ApplicationSummaryAIOutput;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = applicationSummaryAIOutputSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Application summary validation failed",
    details,
  };
}
