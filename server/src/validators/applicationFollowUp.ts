import { z } from "zod";
import {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_PRIORITIES,
} from "../models/ApplicationFollowUp";

const followUpActionSchema = z.enum(FOLLOW_UP_ACTIONS);
export const followUpPrioritySchema = z.enum(FOLLOW_UP_PRIORITIES);
const dueAtSchema = z.string().datetime();
const noteSchema = z.string().trim().max(5000).nullable().optional();

export const createFollowUpSchema = z
  .object({
    action: followUpActionSchema,
    note: noteSchema,
    dueAt: dueAtSchema,
    priority: followUpPrioritySchema.optional(),
  })
  .strict();

export const updateFollowUpSchema = z
  .object({
    action: followUpActionSchema.optional(),
    note: noteSchema,
    dueAt: dueAtSchema.optional(),
    priority: followUpPrioritySchema.optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.action !== undefined ||
      data.note !== undefined ||
      data.dueAt !== undefined ||
      data.priority !== undefined ||
      data.completed !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

const dueBucketSchema = z
  .enum(["overdue", "due_today", "upcoming", "completed", "inactive"])
  .optional();

export const followUpListQuerySchema = z
  .object({
    completed: z.enum(["true", "false"]).optional(),
    priority: followUpPrioritySchema.optional(),
    due: dueBucketSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
