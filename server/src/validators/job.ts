import { z } from "zod";

export const remoteTypes = ["remote", "hybrid", "onsite", "any"] as const;
export const employmentTypes = ["full-time", "part-time", "contract", "internship", "temporary"] as const;
export const experienceLevels = ["entry", "junior", "mid", "senior", "lead", "manager"] as const;

export const MAX_PAGE_LIMIT = 50;

export const jobSearchQuerySchema = z.object({
  keywords: z.string().max(200, "Keywords must be 200 characters or less").optional(),
  location: z.string().max(200, "Location must be 200 characters or less").optional(),
  remote: z.enum(remoteTypes).optional(),
  employmentType: z.enum(employmentTypes).optional(),
  experienceLevel: z.enum(experienceLevels).optional(),
  page: z.coerce.number().int().min(1, "Page must be at least 1").max(10000).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(MAX_PAGE_LIMIT, `Limit must be ${MAX_PAGE_LIMIT} or less`)
    .optional(),
});

export const jobDiscoverRequestSchema = z.object({
  keywords: z.string().max(200, "Keywords must be 200 characters or less").optional(),
  roles: z.array(z.string().max(100)).max(20).optional(),
  locations: z.array(z.string().max(200)).max(20).optional(),
  remote: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
  employmentType: z.enum(employmentTypes).optional(),
  experienceLevel: z.enum(experienceLevels).optional(),
  salaryMinimum: z.coerce.number().int().min(0).max(10000000).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT, `Limit must be ${MAX_PAGE_LIMIT} or less`)
    .optional(),
});
