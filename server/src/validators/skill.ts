import { z } from "zod";

const skillCategories = [
  "Programming",
  "Framework",
  "Database",
  "Cloud",
  "DevOps",
  "AI",
  "Soft Skill",
  "Other",
] as const;

const proficiencies = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
] as const;

export const createSkillSchema = z.object({
  name: z.string().min(1, "Skill name is required").max(100).trim(),
  category: z.enum(skillCategories).optional(),
  proficiency: z.enum(proficiencies).optional(),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  category: z.enum(skillCategories).optional(),
  proficiency: z.enum(proficiencies).optional(),
});
