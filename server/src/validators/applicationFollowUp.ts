import { z } from "zod";
import { FOLLOW_UP_ACTIONS } from "../models/ApplicationFollowUp";

const followUpActionSchema = z.enum(FOLLOW_UP_ACTIONS);
const dueAtSchema = z.string().datetime();

export const createFollowUpSchema = z
  .object({
    action: followUpActionSchema,
    note: z.string().trim().max(5000).nullable().optional(),
    dueAt: dueAtSchema,
  })
  .strict();

export const updateFollowUpSchema = z
  .object({
    action: followUpActionSchema.optional(),
    note: z.string().trim().max(5000).nullable().optional(),
    dueAt: dueAtSchema.optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.action !== undefined ||
      data.note !== undefined ||
      data.dueAt !== undefined ||
      data.completed !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

export const followUpListQuerySchema = z
  .object({
    completed: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
