import { z } from "zod";
import { remoteTypes, employmentTypes, experienceLevels } from "./job";

export const MAX_OPPORTUNITY_LIMIT = 100;
export const DEFAULT_OPPORTUNITY_LIMIT = 20;

export const opportunityQuerySchema = z
  .object({
    keywords: z
      .string()
      .max(200, "Keywords must be 200 characters or less")
      .optional(),
    remote: z.enum(remoteTypes).optional(),
    employmentType: z.enum(employmentTypes).optional(),
    experienceLevel: z.enum(experienceLevels).optional(),
    source: z.string().max(100, "Source must be 100 characters or less").optional(),
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be at least 1")
      .max(10000)
      .optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(MAX_OPPORTUNITY_LIMIT, `Limit must be ${MAX_OPPORTUNITY_LIMIT} or less`)
      .optional(),
  })
  .strict();

export type OpportunityQuery = z.infer<typeof opportunityQuerySchema>;

const urlOrNull = z
  .union([z.string().url("Must be a valid URL"), z.null()])
  .optional();

const ingestJobSchema = z
  .object({
    title: z.string().min(1, "title is required").max(300, "Title is too long"),
    companyName: z
      .string()
      .min(1, "companyName is required")
      .max(300, "Company name is too long"),
    description: z
      .string()
      .min(1, "description is required")
      .max(10000, "Description must be 10000 characters or less"),
    source: z
      .string()
      .min(1, "source is required")
      .max(100, "Source must be 100 characters or less"),
    sourceJobId: z
      .string()
      .min(1, "sourceJobId is required")
      .max(500, "sourceJobId must be 500 characters or less"),
    companyLogo: urlOrNull,
    location: z.string().max(200).nullable().optional(),
    locations: z.array(z.string().max(200)).max(20).optional().default([]),
    remoteType: z.enum(["remote", "hybrid", "onsite"]).optional(),
    employmentType: z.enum(employmentTypes).optional(),
    experienceLevel: z.enum(experienceLevels).optional(),
    salaryMin: z.number().int().min(0).max(100000000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(100000000).nullable().optional(),
    salaryCurrency: z.string().max(10).nullable().optional(),
    salaryPeriod: z
      .enum(["yearly", "monthly", "hourly", "contract"])
      .nullable()
      .optional(),
    skills: z.array(z.string().max(100)).max(200).optional().default([]),
    technologies: z
      .array(z.string().max(100))
      .max(200)
      .optional()
      .default([]),
    jobUrl: urlOrNull,
    applyUrl: urlOrNull,
    postedAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    rawData: z
      .object({})
      .passthrough()
      .optional()
      .default({}),
  })
  .strict();

export const jobIngestSchema = z
  .object({
    jobs: z.array(ingestJobSchema).min(1).max(100),
  })
  .strict();

export type JobIngestInput = z.infer<typeof jobIngestSchema>;
