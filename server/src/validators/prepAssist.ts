import { z } from "zod";

export const prepAssistAIOutputSchema = z
  .object({
    suggestedGoals: z.array(z.string()).default([]),
    suggestedTalkingPoints: z.array(z.string()).default([]),
    suggestedQuestionsToAsk: z.array(z.string()).default([]),
    suggestedChecklistHighlights: z.array(z.string()).default([]),
  })
  .strict();

export type PrepAssistAIOutput = z.infer<typeof prepAssistAIOutputSchema>;

export function validatePrepAssistAIOutput(data: unknown): {
  success: true;
  data: PrepAssistAIOutput;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = prepAssistAIOutputSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Interview preparation assist validation failed",
    details,
  };
}
