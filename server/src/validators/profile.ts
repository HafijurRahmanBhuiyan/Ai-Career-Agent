import { z } from "zod";

export const createProfileSchema = z.object({
  fullName: z.string().max(200).trim().optional(),
  headline: z.string().max(300).trim().optional(),
  summary: z.string().max(5000).trim().optional(),
  phone: z.string().max(30).trim().optional(),
  location: z.string().max(200).trim().optional(),
  preferredRoles: z.array(z.string().trim().max(200)).optional(),
  preferredLocations: z.array(z.string().trim().max(200)).optional(),
  workPreference: z.enum(["remote", "hybrid", "onsite", ""]).optional(),
  salaryExpectation: z
    .object({
      min: z.number().nonnegative().optional(),
      max: z.number().nonnegative().optional(),
      currency: z.string().max(3).trim().optional(),
    })
    .optional(),
});

export const updateProfileSchema = createProfileSchema.partial();
