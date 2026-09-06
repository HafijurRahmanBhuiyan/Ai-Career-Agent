import { z } from "zod";

const urlField = z
  .string()
  .trim()
  .max(300)
  .optional()
  .or(z.literal(""));

const personalInfoSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(150).trim(),
  email: z.string().email("Invalid email").max(200).trim(),
  phone: z.string().min(1, "Phone is required").max(30).trim(),
  location: z.string().min(1, "Location is required").max(200).trim(),
  linkedIn: urlField,
  website: urlField,
});

const educationSchema = z.object({
  institution: z.string().min(1, "Institution is required").max(200).trim(),
  degree: z.string().min(1, "Degree is required").max(150).trim(),
  degreeType: z
    .enum(["SSC", "HSC", "Diploma", "Bachelor's", "Master's"])
    .optional()
    .or(z.literal("")),
  field: z.string().max(150).trim().optional(),
  startDate: z.string().min(1, "Start date is required").max(30).trim(),
  endDate: z.string().max(30).trim().optional(),
  gradeValue: z.string().max(20).trim().optional(),
  highlights: z.array(z.string().trim()).optional(),
});

const workExperienceSchema = z.object({
  company: z.string().min(1, "Company is required").max(200).trim(),
  designation: z.string().min(1, "Designation is required").max(150).trim(),
  location: z.string().max(200).trim().optional(),
  startDate: z.string().min(1, "Start date is required").max(30).trim(),
  endDate: z.string().max(30).trim().optional(),
  current: z.boolean().optional(),
  description: z.string().max(2000).trim().optional(),
  highlights: z.array(z.string().trim()).default([]),
});

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(150).trim(),
  description: z.string().max(1000).trim().optional(),
  githubLink: urlField,
  liveLink: urlField,
  highlights: z.array(z.string().trim()).optional(),
});

const additionalInfoSchema = z.object({
  bullets: z.array(z.string().trim()).optional(),
  description: z.string().max(2000).trim().optional(),
});

export const createCVProfileSchema = z.object({
  title: z.string().min(1, "CV title is required").max(200).trim(),
  personalInfo: personalInfoSchema,
  professionalSummary: z.string().max(2000).trim().optional(),
  education: z.array(educationSchema).optional(),
  workExperience: z.array(workExperienceSchema).optional(),
  skills: z.array(z.string().trim()).optional(),
  projects: z.array(projectSchema).optional(),
  achievements: z.array(z.string().trim()).optional(),
  additionalInfo: additionalInfoSchema.optional(),
});

export const updateCVProfileSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  personalInfo: personalInfoSchema.partial().optional(),
  professionalSummary: z.string().max(2000).trim().optional(),
  education: z.array(educationSchema).optional(),
  workExperience: z.array(workExperienceSchema).optional(),
  skills: z.array(z.string().trim()).optional(),
  projects: z.array(projectSchema).optional(),
  achievements: z.array(z.string().trim()).optional(),
  additionalInfo: additionalInfoSchema.optional(),
});

export type CreateCVProfileInput = z.infer<typeof createCVProfileSchema>;
export type UpdateCVProfileInput = z.infer<typeof updateCVProfileSchema>;
