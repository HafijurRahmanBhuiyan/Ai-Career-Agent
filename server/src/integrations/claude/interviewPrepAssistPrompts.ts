export const INTERVIEW_PREP_ASSIST_PROMPT_VERSION = "v1";

export const INTERVIEW_PREP_ASSIST_SYSTEM_PROMPT = `You are a senior interview-coach AI that produces interview preparation suggestions for a single tracked job application.

Analyze ONLY the supplied application data. Everything (job details, application status, timeline events, related emails, job-match analysis, and the user's existing preparation notes) is TRUSTED input provided by the system.

STRICT RULES:
- Do NOT invent facts. Only reference information that is present in the supplied data. If something is unknown, do not assert it.
- Do NOT fabricate interview dates, interviewer names, meeting URLs, or company history.
- Recommendations must be phrased as suggestions (e.g. "Consider...", "You could..."), never as commands or as facts.
- Do NOT include credentials, tokens, or confidential material. Output only the requested JSON.
- Keep the number of suggestions small and actionable.

You MUST return ONLY valid JSON matching this EXACT schema. No markdown, no code fences, no extra text, no extra fields.

{
  "suggestedGoals": ["string — a suggested interview goal, or an empty array"],
  "suggestedTalkingPoints": ["string — a suggested talking point, or an empty array"],
  "suggestedQuestionsToAsk": ["string — a question the user could ask the interviewer, or an empty array"],
  "suggestedChecklistHighlights": ["string — a checklist item to prioritize, or an empty array"]
}`;

export interface InterviewPrepAssistInput {
  job: {
    title?: string | null;
    companyName?: string | null;
    description?: string | null;
    locations?: string[] | null;
    remoteType?: string | null;
    employmentType?: string | null;
    experienceLevel?: string | null;
    skills?: string[] | null;
    technologies?: string[] | null;
  };
  application: {
    status?: string | null;
    notes?: string | null;
  };
  timeline: Array<{
    type?: string | null;
    title?: string | null;
    eventDate?: string | null;
    source?: string | null;
  }>;
  emails: Array<{
    category?: string | null;
    subject?: string | null;
    receivedAt?: string | null;
    summary?: string | null;
  }>;
  jobMatch?: {
    matchLevel?: string | null;
    score?: number | null;
    strengths?: string[] | null;
    weaknesses?: string[] | null;
    recommendation?: string | null;
  } | null;
  existingPreparation?: {
    goals?: string[] | null;
    talkingPoints?: string[] | null;
    questionsToAsk?: string[] | null;
    companyResearchNotes?: string | null;
    rolePreparationNotes?: string | null;
    checklist?: Array<{
      key?: string | null;
      completed?: boolean | null;
    }> | null;
  } | null;
}

export function buildInterviewPrepAssistUserMessage(
  input: InterviewPrepAssistInput
): string {
  return [
    "[START INTERVIEW PREP ASSIST INPUT - TRUSTED]",
    JSON.stringify(input, null, 2),
    "[END INTERVIEW PREP ASSIST INPUT]",
  ].join("\n");
}
