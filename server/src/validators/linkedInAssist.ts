import { z } from "zod";

const suggestionSchema = z.object({
  hook: z.string().min(1, "hook is required").max(300),
  body: z.string().min(1, "body is required").max(3000),
  hashtags: z
    .array(z.string().min(1))
    .max(10, "hashtags must have at most 10 items"),
});

export const linkedInAssistResultSchema = z.object({
  suggestions: z
    .array(suggestionSchema)
    .min(1, "suggestions must have at least one item")
    .max(3, "suggestions may have at most 3 items"),
});

export type ValidatedLinkedInAssist = z.infer<
  typeof linkedInAssistResultSchema
>;
