import { z } from "zod";

const maxString = (name: string, max: number) =>
  z.string().max(max, `${name} must be ${max} characters or less`).optional();

export const updateEvidenceSchema = z
  .object({
    professionalSummary: maxString("professionalSummary", 5000),
    problemSolved: maxString("problemSolved", 5000),
    contributionEvidence: maxString("contributionEvidence", 5000),
    measurableImpact: maxString("measurableImpact", 3000),
    projectDomain: maxString("projectDomain", 200),
    technicalSkills: z.array(z.string().min(1)).max(200).optional(),
    architecturePractices: z.array(z.string().min(1)).max(200).optional(),
    technologies: z.array(z.string().min(1)).max(200).optional(),
    proposedTalkingPoints: z.array(z.string().min(1)).max(100).optional(),
    suggestedPostAngles: z.array(z.string().min(1)).max(100).optional(),
    roleRelevantKeywords: z.array(z.string().min(1)).max(200).optional(),
    senioritySignals: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();

export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;

export const createDraftSchema = z
  .object({
    evidence: z.string().min(1, "evidence is required"),
    hook: maxString("hook", 300),
    body: maxString("body", 3000),
    hashtags: z.array(z.string().min(1)).max(10).optional(),
  })
  .strict();

export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export const updateDraftSchema = z
  .object({
    hook: maxString("hook", 300),
    body: maxString("body", 3000),
    hashtags: z.array(z.string().min(1)).max(10).optional(),
  })
  .strict();

export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

export const approveDraftSchema = z.object({}).strict();

export const listDraftsQuerySchema = z
  .object({
    status: z
      .enum([
        "draft",
        "reviewed",
        "approved",
        "publishing",
        "published",
        "publish_failed",
        "archived",
      ])
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
