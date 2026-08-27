import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200).trim(),
  description: z.string().min(1, "Project description is required").max(5000).trim(),
  technologies: z.array(z.string().trim().max(100)).optional(),
  features: z.array(z.string().trim().max(500)).optional(),
  role: z.string().max(200).trim().optional(),
  githubUrl: z.string().url("Invalid GitHub URL").startsWith("https://").optional(),
  liveUrl: z.string().url("Invalid live URL").startsWith("https://").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(5000).trim().optional(),
  technologies: z.array(z.string().trim().max(100)).optional(),
  features: z.array(z.string().trim().max(500)).optional(),
  role: z.string().max(200).trim().optional(),
  githubUrl: z.string().url("Invalid GitHub URL").startsWith("https://").optional(),
  liveUrl: z.string().url("Invalid live URL").startsWith("https://").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
