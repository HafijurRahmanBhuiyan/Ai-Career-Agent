import {
  validateAnalysisResult,
  projectAnalysisResultSchema,
} from "../src/validators/projectAnalysis";

describe("Project Analysis Validation Schema", () => {
  const validAnalysis = {
    projectSummary: "A web app for task management.",
    problemStatement: "Teams need better collaboration tools.",
    keyFeatures: ["Real-time updates", "Task boards"],
    technologies: ["React", "Node.js"],
    programmingLanguages: ["TypeScript"],
    frameworks: ["Express"],
    databases: ["MongoDB"],
    tools: ["Git"],
    cloudServices: ["AWS"],
    architecture: "Client-server",
    developmentHighlights: ["TypeScript"],
    skillsDemonstrated: ["Full-stack"],
    difficultyLevel: "Intermediate" as const,
    developerRole: "Full-Stack Developer",
    resumeDescription: "Built a task management platform.",
    linkedinDescription: "Developed a collaborative task tool.",
    suggestedTags: ["task-management"],
  };

  it("should validate a complete valid analysis", () => {
    const result = validateAnalysisResult(validAnalysis);
    expect(result.success).toBe(true);
  });

  it("should reject missing projectSummary", () => {
    const { projectSummary, ...rest } = validAnalysis;
    const result = validateAnalysisResult(rest);
    expect(result.success).toBe(false);
  });

  it("should reject missing problemStatement", () => {
    const { problemStatement, ...rest } = validAnalysis;
    const result = validateAnalysisResult(rest);
    expect(result.success).toBe(false);
  });

  it("should reject empty keyFeatures", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      keyFeatures: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty technologies", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      technologies: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty programmingLanguages", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      programmingLanguages: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid difficultyLevel", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      difficultyLevel: "Expert",
    });
    expect(result.success).toBe(false);
  });

  it("should accept Beginner difficultyLevel", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      difficultyLevel: "Beginner",
    });
    expect(result.success).toBe(true);
  });

  it("should accept Advanced difficultyLevel", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      difficultyLevel: "Advanced",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing resumeDescription", () => {
    const { resumeDescription, ...rest } = validAnalysis;
    const result = validateAnalysisResult(rest);
    expect(result.success).toBe(false);
  });

  it("should reject missing linkedinDescription", () => {
    const { linkedinDescription, ...rest } = validAnalysis;
    const result = validateAnalysisResult(rest);
    expect(result.success).toBe(false);
  });

  it("should allow empty optional arrays", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      databases: [],
      tools: [],
      cloudServices: [],
      developmentHighlights: [],
      suggestedTags: [],
    });
    expect(result.success).toBe(true);
  });

  it("should return details on failure", () => {
    const result = validateAnalysisResult({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.details).toBeDefined();
      expect(result.details!.length).toBeGreaterThan(0);
    }
  });

  it("should reject null input", () => {
    const result = validateAnalysisResult(null);
    expect(result.success).toBe(false);
  });

  it("should reject string input", () => {
    const result = validateAnalysisResult("invalid");
    expect(result.success).toBe(false);
  });

  it("should reject empty projectSummary", () => {
    const result = validateAnalysisResult({
      ...validAnalysis,
      projectSummary: "",
    });
    expect(result.success).toBe(false);
  });
});
