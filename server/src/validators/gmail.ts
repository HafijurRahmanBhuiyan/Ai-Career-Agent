import { z } from "zod";
import { APPLICATION_STATUSES } from "../models/Application";
import { CAREER_EMAIL_CATEGORIES } from "../models/CareerEmail";

const careerEmailCategorySchema = z.enum(CAREER_EMAIL_CATEGORIES);
const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export const emailListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: careerEmailCategorySchema.optional(),
  applicationStatus: applicationStatusSchema.optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export const applyStatusSchema = z.object({
  status: applicationStatusSchema,
});

export const syncQuerySchema = z.object({
  max: z.coerce.number().int().min(1).max(100).optional(),
});

export type EmailListQuery = z.infer<typeof emailListQuerySchema>;
export type ApplyStatusInput = z.infer<typeof applyStatusSchema>;
export type SyncQuery = z.infer<typeof syncQuerySchema>;
