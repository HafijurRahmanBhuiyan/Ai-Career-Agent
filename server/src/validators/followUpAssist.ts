import { z } from "zod";
import {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_PRIORITIES,
} from "../models/ApplicationFollowUp";

const followUpAssistSuggestionSchema = z
  .object({
    action: z.enum(FOLLOW_UP_ACTIONS),
    note: z.string().trim().max(5000).nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    priority: z.enum(FOLLOW_UP_PRIORITIES),
    reason: z.string().trim().max(2000),
  })
  .strict();

export const followUpAssistAIOutputSchema = z
  .object({
    suggestions: z.array(followUpAssistSuggestionSchema).max(5).default([]),
  })
  .strict();

export type FollowUpAssistAIOutput = z.infer<typeof followUpAssistAIOutputSchema>;
export type FollowUpAssistSuggestion = z.infer<
  typeof followUpAssistSuggestionSchema
>;

export function validateFollowUpAssistAIOutput(data: unknown): {
  success: true;
  data: FollowUpAssistAIOutput;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = followUpAssistAIOutputSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Follow-up assist validation failed",
    details,
  };
}
