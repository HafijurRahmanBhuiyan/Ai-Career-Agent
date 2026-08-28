import { z } from "zod";
import { CHECKLIST_KEYS } from "../models/InterviewPreparation";

const checklistKeySchema = z.enum(CHECKLIST_KEYS);
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

const checklistItemInputSchema = z
  .object({
    key: checklistKeySchema,
    label: z.string().trim().min(1).max(200),
    completed: z.boolean(),
  })
  .strict();

export const createPreparationSchema = z
  .object({
    notes: z.string().trim().max(10000).optional(),
    goals: z.array(z.string().trim().max(500)).max(20).optional(),
    talkingPoints: z.array(z.string().trim().max(500)).max(20).optional(),
    questionsToAsk: z.array(z.string().trim().max(500)).max(30).optional(),
    companyResearchNotes: z.string().trim().max(10000).optional(),
    rolePreparationNotes: z.string().trim().max(10000).optional(),
    checklist: z.array(checklistItemInputSchema).max(50).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.notes !== undefined ||
      data.goals !== undefined ||
      data.talkingPoints !== undefined ||
      data.questionsToAsk !== undefined ||
      data.companyResearchNotes !== undefined ||
      data.rolePreparationNotes !== undefined ||
      data.checklist !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

export const updatePreparationSchema = createPreparationSchema;

export const preparationAssistQuerySchema = z
  .object({})
  .strict();

export type CreatePreparationInput = z.infer<
  typeof createPreparationSchema
>;
export type UpdatePreparationInput = z.infer<
  typeof updatePreparationSchema
>;
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;
