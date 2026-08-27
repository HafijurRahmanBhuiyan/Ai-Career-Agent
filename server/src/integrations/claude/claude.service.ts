import { analyzeProject } from "./claudeClient";
import {
  PROJECT_ANALYSIS_SYSTEM_PROMPT,
  buildProjectAnalysisUserMessage,
} from "./prompts";
import { JOB_MATCH_SYSTEM_PROMPT, buildJobMatchUserMessage } from "./jobMatchPrompts";
import {
  ProjectAnalysisInput,
  ProjectAnalysisResult,
} from "./claude.types";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../../services/jobMatchTypes";

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

    return this.parseResponse(rawResponse) as ProjectAnalysisResult;
  }

  async analyzeJobMatch(
    profile: JobMatchProfilePayload,
    job: JobMatchJobPayload
  ): Promise<unknown> {
    const userMessage = buildJobMatchUserMessage(profile, job);

    const rawResponse = await analyzeProject(
      JOB_MATCH_SYSTEM_PROMPT,
      userMessage
    );

    return this.parseResponse(rawResponse);
  }

  private parseResponse(raw: string): unknown {
    let cleaned = raw.trim();

    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch {
      throw new Error("Failed to parse Claude response as valid JSON");
    }
  }
}
