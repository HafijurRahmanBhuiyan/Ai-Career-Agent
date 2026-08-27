import { z } from "zod";

export const createEducationSchema = z.object({
  degree: z.string().min(1, "Degree is required").max(200).trim(),
  institution: z.string().min(1, "Institution is required").max(200).trim(),
  field: z.string().max(200).trim().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  grade: z.string().max(50).trim().optional(),
  description: z.string().max(2000).trim().optional(),
});

export const updateEducationSchema = z.object({
  degree: z.string().min(1).max(200).trim().optional(),
  institution: z.string().min(1).max(200).trim().optional(),
  field: z.string().max(200).trim().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  grade: z.string().max(50).trim().optional(),
  description: z.string().max(2000).trim().optional(),
});
