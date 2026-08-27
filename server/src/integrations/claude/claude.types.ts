export interface ProjectAnalysisInput {
  repository: {
    name: string;
    fullName: string;
    description: string | null;
    language: string | null;
    topics: string[];
    defaultBranch: string;
    stars: number;
    forks: number;
    size: number;
  };
  languages: Record<string, number>;
  readme: string | null;
}

export interface ProjectAnalysisResult {
  projectSummary: string;
  problemStatement: string;
  keyFeatures: string[];
  technologies: string[];
  programmingLanguages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
  cloudServices: string[];
  architecture: string;
  developmentHighlights: string[];
  skillsDemonstrated: string[];
  difficultyLevel: "Beginner" | "Intermediate" | "Advanced";
  developerRole: string;
  resumeDescription: string;
  linkedinDescription: string;
  suggestedTags: string[];
}
