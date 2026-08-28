import { z } from "zod";

export const executeApplicationSchema = z
  .object({
    submitted: z.boolean({
      required_error: "submitted is required",
      invalid_type_error: "submitted must be a boolean",
    }),
  })
  .strict();

export type ExecuteApplicationInput = z.infer<typeof executeApplicationSchema>;

export const jobFitAssistSchema = z.object({}).strict();

export const executionParamsSchema = z.object({
  id: z.string().min(1),
});
