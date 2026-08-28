import { z } from "zod";
import { APPLICATION_EVENT_TYPES } from "../models/ApplicationEvent";

const applicationEventTypeSchema = z.enum(APPLICATION_EVENT_TYPES);

export const timelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createTimelineEventSchema = z
  .object({
    type: applicationEventTypeSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5000).optional(),
    eventDate: z.string().datetime(),
  })
  .strict();

export const updateTimelineEventSchema = z
  .object({
    type: applicationEventTypeSchema.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(5000).optional(),
    eventDate: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.type !== undefined ||
      data.title !== undefined ||
      data.description !== undefined ||
      data.eventDate !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type CreateTimelineEventInput = z.infer<
  typeof createTimelineEventSchema
>;
export type UpdateTimelineEventInput = z.infer<
  typeof updateTimelineEventSchema
>;
