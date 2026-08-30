import { analyzeWithAI, analyzeWithAIFallback } from "../ai/aiRouter";
import { AIProvider } from "../ai/ai.types";
import {
  PROJECT_ANALYSIS_SYSTEM_PROMPT,
  buildProjectAnalysisUserMessage,
} from "./prompts";
import {
  JOB_MATCH_SYSTEM_PROMPT,
  buildJobMatchUserMessage,
} from "./jobMatchPrompts";
import {
  EMAIL_SYSTEM_PROMPT,
  buildEmailUserMessage,
} from "./emailPrompts";
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
  FOLLOW_UP_ASSIST_SYSTEM_PROMPT,
  buildFollowUpAssistUserMessage,
  FollowUpAssistInput,
} from "./followUpAssistPrompts";
import {
  LINKEDIN_ASSIST_SYSTEM_PROMPT,
  buildLinkedInAssistUserMessage,
  LinkedInAssistInput,
} from "./linkedinPrompts";
import {
  JOB_FIT_ASSIST_SYSTEM_PROMPT,
  buildJobFitAssistUserMessage,
  JobFitAssistInput,
} from "./jobFitAssistPrompts";
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

  async analyzeProject(
    input: ProjectAnalysisInput,
    provider?: AIProvider
  ): Promise<{ result: ProjectAnalysisResult; model: string }> {
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

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: PROJECT_ANALYSIS_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return {
      result: this.parseResponse(rawResponse.text) as ProjectAnalysisResult,
      model: rawResponse.model,
    };
  }

  async analyzeJobMatch(
    profile: JobMatchProfilePayload,
    job: JobMatchJobPayload,
    provider?: AIProvider
  ): Promise<unknown> {
    const userMessage = buildJobMatchUserMessage(profile, job);

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: JOB_MATCH_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return this.parseResponse(rawResponse.text);
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

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: EMAIL_SYSTEM_PROMPT,
        userMessage,
      },
    );

    const parsed = this.parseResponse(rawResponse.text) as EmailClassification;

    return this.normalizeClassification(parsed);
  }

  async analyzeApplicationSummary(
    input: ApplicationSummaryInput,
    provider?: AIProvider
  ): Promise<unknown> {
    const userMessage = buildApplicationSummaryUserMessage(input);

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: APPLICATION_SUMMARY_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return this.parseResponse(rawResponse.text);
  }

  async assistInterviewPreparation(
    input: InterviewPrepAssistInput,
    provider?: AIProvider
  ): Promise<unknown> {
    const userMessage = buildInterviewPrepAssistUserMessage(input);

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: INTERVIEW_PREP_ASSIST_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return this.parseResponse(rawResponse.text);
  }

  async assistFollowUps(input: FollowUpAssistInput, provider?: AIProvider): Promise<unknown> {
    const userMessage = buildFollowUpAssistUserMessage(input);

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: FOLLOW_UP_ASSIST_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return this.parseResponse(rawResponse.text);
  }

  async assistLinkedInPost(input: LinkedInAssistInput, provider?: AIProvider): Promise<unknown> {
    const userMessage = buildLinkedInAssistUserMessage(input);

    const rawResponse = await analyzeWithAIFallback(
      {
        systemPrompt: LINKEDIN_ASSIST_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return this.parseResponse(rawResponse.text);
  }

  async assistJobFit(input: JobFitAssistInput, provider?: AIProvider): Promise<unknown> {
    const userMessage = buildJobFitAssistUserMessage(input);

    const rawResponse = await analyzeWithAI(
      {
        systemPrompt: JOB_FIT_ASSIST_SYSTEM_PROMPT,
        userMessage,
      },
      provider
    );

    return this.parseResponse(rawResponse.text);
  }

  private normalizeClassification(value: unknown): EmailClassification {
    if (!value || typeof value !== "object") {
      throw new Error("Failed to parse AI response as valid JSON");
    }

    const record = value as Record<string, unknown>;

    const rawInterview =
      (record.interview as Record<string, unknown> | undefined) || {};

    const interviewType = (record.interviewType as string | null) ?? null;
    const interviewDate = (record.interviewDate as string | null) ?? null;

    return {
      category: record.category as EmailClassification["category"],
      confidence:
        typeof record.confidence === "number" ? record.confidence : 0,
      summary: (record.summary as string) || "",
      companyName: (record.companyName as string | null) ?? null,
      jobTitle: (record.jobTitle as string | null) ?? null,
      applicationStatus:
        (record.applicationStatus as EmailClassification["applicationStatus"]) ??
        null,
      interviewDate,
      interviewType,
      actionRequired:
        typeof record.actionRequired === "boolean"
          ? record.actionRequired
          : null,
      actionDeadline: (record.actionDeadline as string | null) ?? null,
      interview: {
        type: interviewType,
        scheduledAt: interviewDate,
        interviewer: (rawInterview.interviewer as string | null) ?? null,
        meetingUrl: (rawInterview.meetingUrl as string | null) ?? null,
        location: (rawInterview.location as string | null) ?? null,
        notes: (rawInterview.notes as string | null) ?? null,
      },
      extractedApplicationHints: {
        companyName:
          (
            record.extractedApplicationHints as
              | Record<string, unknown>
              | undefined
          )?.companyName as string | null | undefined ?? null,
        jobTitle:
          (
            record.extractedApplicationHints as
              | Record<string, unknown>
              | undefined
          )?.jobTitle as string | null | undefined ?? null,
      },
    };
  }

  private parseResponse(raw: string): unknown {
    let cleaned = raw.trim();

    const fenceMatch = cleaned.match(
      /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
    );

    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as valid JSON");
    }
  }
}
