import { analyzeProject } from "./claudeClient";
import {
  PROJECT_ANALYSIS_SYSTEM_PROMPT,
  buildProjectAnalysisUserMessage,
} from "./prompts";
import { JOB_MATCH_SYSTEM_PROMPT, buildJobMatchUserMessage } from "./jobMatchPrompts";
import { EMAIL_SYSTEM_PROMPT, buildEmailUserMessage } from "./emailPrompts";
import {
  APPLICATION_SUMMARY_SYSTEM_PROMPT,
  buildApplicationSummaryUserMessage,
  ApplicationSummaryInput,
} from "./applicationSummaryPrompts";
import {
  INTERVIEW_PREP_ASSIST_SYSTEM_PROMPT,
  buildInterviewPrepAssistUserMessage,
  InterviewPrepAssistInput,
} from "./interviewPrepAssistPrompts";
import {
  ProjectAnalysisInput,
  ProjectAnalysisResult,
} from "./claude.types";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../../services/jobMatchTypes";
import { EmailClassification } from "./emailClassification.types";

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

  async classifyCareerEmail(email: {
    subject?: string;
    from?: string;
    to?: string;
    date?: string;
    snippet?: string;
    body?: string;
  }): Promise<EmailClassification> {
    const userMessage = buildEmailUserMessage(email);

    const rawResponse = await analyzeProject(EMAIL_SYSTEM_PROMPT, userMessage);

    const parsed = this.parseResponse(rawResponse) as EmailClassification;

    return this.normalizeClassification(parsed);
  }

  async analyzeApplicationSummary(
    input: ApplicationSummaryInput
  ): Promise<unknown> {
    const userMessage = buildApplicationSummaryUserMessage(input);

    const rawResponse = await analyzeProject(
      APPLICATION_SUMMARY_SYSTEM_PROMPT,
      userMessage
    );

    return this.parseResponse(rawResponse);
  }

  async assistInterviewPreparation(
    input: InterviewPrepAssistInput
  ): Promise<unknown> {
    const userMessage = buildInterviewPrepAssistUserMessage(input);

    const rawResponse = await analyzeProject(
      INTERVIEW_PREP_ASSIST_SYSTEM_PROMPT,
      userMessage
    );

    return this.parseResponse(rawResponse);
  }

  private normalizeClassification(value: unknown): EmailClassification {
    if (!value || typeof value !== "object") {
      throw new Error("Failed to parse Claude response as valid JSON");
    }

    const record = value as Record<string, unknown>;

    const rawInterview =
      (record.interview as Record<string, unknown> | undefined) || {};

    const interviewType = (record.interviewType as string | null) ?? null;
    const interviewDate = (record.interviewDate as string | null) ?? null;

    return {
      category: record.category as EmailClassification["category"],
      confidence: typeof record.confidence === "number" ? record.confidence : 0,
      summary: (record.summary as string) || "",
      companyName: (record.companyName as string | null) ?? null,
      jobTitle: (record.jobTitle as string | null) ?? null,
      applicationStatus: (record.applicationStatus as EmailClassification["applicationStatus"]) ?? null,
      interviewDate,
      interviewType,
      actionRequired:
        typeof record.actionRequired === "boolean" ? record.actionRequired : null,
      actionDeadline: (record.actionDeadline as string | null) ?? null,
      interview: {
        type: interviewType,
        scheduledAt: interviewDate,
        interviewer:
          (rawInterview.interviewer as string | null) ?? null,
        meetingUrl:
          (rawInterview.meetingUrl as string | null) ?? null,
        location:
          (rawInterview.location as string | null) ?? null,
        notes:
          (rawInterview.notes as string | null) ?? null,
      },
      extractedApplicationHints: {
        companyName:
          (record.extractedApplicationHints as Record<string, unknown> | undefined)
            ?.companyName as string | null | undefined ?? null,
        jobTitle:
          (record.extractedApplicationHints as Record<string, unknown> | undefined)
            ?.jobTitle as string | null | undefined ?? null,
      },
    };
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
