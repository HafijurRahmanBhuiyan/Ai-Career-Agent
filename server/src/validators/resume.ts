import { z } from "zod";

export const createResumeSchema = z.object({
  title: z.string().min(1, "Resume title is required").max(200).trim(),
  fileName: z.string().min(1, "File name is required").max(255).trim(),
  fileUrl: z.string().url("Invalid URL").optional(),
  version: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const updateResumeSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  fileName: z.string().min(1).max(255).trim().optional(),
  fileUrl: z.string().url("Invalid URL").optional(),
  version: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});
