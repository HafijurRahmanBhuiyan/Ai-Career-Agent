import { analyzeProject } from "./claudeClient";
import {
  PROJECT_ANALYSIS_SYSTEM_PROMPT,
  buildProjectAnalysisUserMessage,
} from "./prompts";
import { ProjectAnalysisInput, ProjectAnalysisResult } from "./claude.types";

export class ClaudeService {
  async analyzeProject(input: ProjectAnalysisInput): Promise<ProjectAnalysisResult> {
    const userMessage = buildProjectAnalysisUserMessage(
      input.repository.name,
      input.repository.description,
      input.repository.language,
      input.repository.topics,
      input.languages,
      input.readme,
      input.repository.stars,
      input.repository.forks,
      input.repository.size
    );

    const rawResponse = await analyzeProject(
      PROJECT_ANALYSIS_SYSTEM_PROMPT,
      userMessage
    );

    const parsed = this.parseResponse(rawResponse);
    return parsed;
  }

  private parseResponse(raw: string): ProjectAnalysisResult {
    let cleaned = raw.trim();

    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(cleaned);
      return parsed as ProjectAnalysisResult;
    } catch {
      throw new Error("Failed to parse Claude response as valid JSON");
    }
  }
}
