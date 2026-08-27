export const PROJECT_ANALYSIS_PROMPT_VERSION = "v1";

export const PROJECT_ANALYSIS_SYSTEM_PROMPT = `You are an expert software project analyst. Your task is to analyze a developer's GitHub repository and produce a structured JSON analysis.

Analyze the repository based ONLY on the provided information. Do NOT invent technologies, frameworks, databases, cloud services, or features that are not evidenced in the repository data.

Clearly distinguish between:
- Explicitly detected: directly visible in language stats, topics, README, or metadata
- Reasonable inference: strongly implied by context but not directly stated

Your output will be used for:
- Developer portfolio
- Resume project descriptions
- LinkedIn project content
- Future job matching

You MUST return ONLY valid JSON matching this exact schema. Do NOT include markdown, code fences, or any text outside the JSON.

{
  "projectSummary": "string — 2-3 sentence overview of the project",
  "problemStatement": "string — what problem this project solves",
  "keyFeatures": ["string — list of main features"],
  "technologies": ["string — all technologies detected or inferred"],
  "programmingLanguages": ["string — programming languages used"],
  "frameworks": ["string — frameworks and libraries"],
  "databases": ["string — databases detected, empty if none"],
  "tools": ["string — development tools (build tools, CI, etc)"],
  "cloudServices": ["string — cloud platforms/services, empty if none"],
  "architecture": "string — brief architecture description",
  "developmentHighlights": ["string — notable engineering practices"],
  "skillsDemonstrated": ["string — developer skills shown by this project"],
  "difficultyLevel": "Beginner | Intermediate | Advanced",
  "developerRole": "string — likely role of the developer for this project",
  "resumeDescription": "string — professional resume bullet point (1-2 sentences)",
  "linkedinDescription": "string — engaging LinkedIn project description (2-3 sentences)",
  "suggestedTags": ["string — relevant tags for discoverability"]
}`;

export function buildProjectAnalysisUserMessage(
  repoName: string,
  repoDescription: string | null,
  primaryLanguage: string | null,
  topics: string[],
  languages: Record<string, number>,
  readmeContent: string | null,
  stars: number,
  forks: number,
  size: number
): string {
  const parts: string[] = [];

  parts.push(`Repository: ${repoName}`);
  if (repoDescription) {
    parts.push(`Description: ${repoDescription}`);
  }
  if (primaryLanguage) {
    parts.push(`Primary Language: ${primaryLanguage}`);
  }
  if (topics.length > 0) {
    parts.push(`Topics: ${topics.join(", ")}`);
  }

  const languageEntries = Object.entries(languages);
  if (languageEntries.length > 0) {
    const totalBytes = languageEntries.reduce((sum, [, bytes]) => sum + bytes, 0);
    const languageBreakdown = languageEntries
      .map(([lang, bytes]) => {
        const pct = totalBytes > 0 ? ((bytes / totalBytes) * 100).toFixed(1) : "0";
        return `${lang} (${pct}%)`;
      })
      .join(", ");
    parts.push(`Languages: ${languageBreakdown}`);
  }

  parts.push(`Stars: ${stars}, Forks: ${forks}, Size: ${size}KB`);

  if (readmeContent) {
    parts.push(`\nREADME Content:\n${readmeContent}`);
  } else {
    parts.push("\nNo README available.");
  }

  return parts.join("\n");
}
