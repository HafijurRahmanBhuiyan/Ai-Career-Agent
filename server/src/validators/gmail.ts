import { z } from "zod";
import { APPLICATION_STATUSES } from "../models/Application";
import {
  CAREER_EMAIL_CATEGORIES,
  DETECTED_CAREER_STATUSES,
} from "../models/CareerEmail";

const careerEmailCategorySchema = z.enum(CAREER_EMAIL_CATEGORIES);
const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
const detectedCareerStatusSchema = z.enum(DETECTED_CAREER_STATUSES);

export const emailListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: careerEmailCategorySchema.optional(),
  applicationStatus: applicationStatusSchema.optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

// Manual career-status application is restricted to the hiring stages Gmail
// detection can derive (screening/interview/offer/rejected). "applied" is only
// ever set by the explicit execution flow and "withdrawn" is never applied.
export const applyStatusSchema = z.object({
  status: detectedCareerStatusSchema,
});

export const syncQuerySchema = z.object({
  max: z.coerce.number().int().min(1).max(100).optional(),
});

export type EmailListQuery = z.infer<typeof emailListQuerySchema>;
export type ApplyStatusInput = z.infer<typeof applyStatusSchema>;
export type SyncQuery = z.infer<typeof syncQuerySchema>;
