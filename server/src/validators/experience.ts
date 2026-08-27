import { z } from "zod";

export const createExperienceSchema = z.object({
  company: z.string().min(1, "Company is required").max(200).trim(),
  position: z.string().min(1, "Position is required").max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  currentlyWorking: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.currentlyWorking && data.endDate) {
      return false;
    }
    return true;
  },
  {
    message: "endDate must not be provided when currentlyWorking is true",
    path: ["endDate"],
  }
);

export const updateExperienceSchema = z.object({
  company: z.string().min(1).max(200).trim().optional(),
  position: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  currentlyWorking: z.boolean().optional(),
});
