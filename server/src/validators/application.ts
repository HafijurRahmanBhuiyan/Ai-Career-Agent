import { z } from "zod";
import { APPLICATION_STATUSES } from "../models/Application";

const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export const createApplicationSchema = z.object({
  jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid job ID"),

  status: applicationStatusSchema.optional(),

  appliedAt: z
    .string()
    .datetime()
    .optional(),

  notes: z
    .string()
    .trim()
    .max(5000)
    .optional(),
});

export const updateApplicationSchema = z
  .object({
    status: applicationStatusSchema.optional(),

    appliedAt: z
      .string()
      .datetime()
      .nullable()
      .optional(),

    notes: z
      .string()
      .trim()
      .max(5000)
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.appliedAt !== undefined ||
      data.notes !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

export const applicationListQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10),

  status: applicationStatusSchema.optional(),
});

export type CreateApplicationInput = z.infer<
  typeof createApplicationSchema
>;

export type UpdateApplicationInput = z.infer<
  typeof updateApplicationSchema
>;

export type ApplicationListQuery = z.infer<
  typeof applicationListQuerySchema
>;