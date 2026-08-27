import { z } from "zod";

export const projectAnalysisResultSchema = z.object({
  projectSummary: z.string().min(1, "projectSummary is required"),
  problemStatement: z.string().min(1, "problemStatement is required"),
  keyFeatures: z.array(z.string()).min(1, "keyFeatures must have at least one item"),
  technologies: z.array(z.string()).min(1, "technologies must have at least one item"),
  programmingLanguages: z.array(z.string()).min(1, "programmingLanguages must have at least one item"),
  frameworks: z.array(z.string()),
  databases: z.array(z.string()),
  tools: z.array(z.string()),
  cloudServices: z.array(z.string()),
  architecture: z.string().min(1, "architecture is required"),
  developmentHighlights: z.array(z.string()),
  skillsDemonstrated: z.array(z.string()).min(1, "skillsDemonstrated must have at least one item"),
  difficultyLevel: z.enum(["Beginner", "Intermediate", "Advanced"]),
  developerRole: z.string().min(1, "developerRole is required"),
  resumeDescription: z.string().min(1, "resumeDescription is required"),
  linkedinDescription: z.string().min(1, "linkedinDescription is required"),
  suggestedTags: z.array(z.string()),
});

export type ValidatedProjectAnalysis = z.infer<typeof projectAnalysisResultSchema>;

export function validateAnalysisResult(data: unknown): {
  success: true;
  data: ValidatedProjectAnalysis;
} | {
  success: false;
  error: string;
  details?: string[];
} {
  const result = projectAnalysisResultSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    success: false,
    error: "Analysis validation failed",
    details,
  };
}
