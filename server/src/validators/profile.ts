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
  jobSearchPreferences: z
    .object({
      roles: z.array(z.string().trim().max(200)).optional(),
      locations: z.array(z.string().trim().max(200)).optional(),
      remote: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
      experienceLevel: z.enum(["entry", "junior", "mid", "senior", "lead", "manager", ""]).optional(),
      salaryMinimum: z.number().nonnegative().optional(),
    })
    .strict()
    .optional(),
  notificationEmail: z
    .string()
    .max(320)
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Notification email must be a valid email address",
    })
    .optional()
    .or(z.literal("")),
  gmailNotifyEnabled: z.boolean().optional(),
  gmailAutoStatusEnabled: z.boolean().optional(),
});

export const updateProfileSchema = createProfileSchema.partial();
