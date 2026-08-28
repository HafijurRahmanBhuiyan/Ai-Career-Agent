export const FOLLOW_UP_ASSIST_PROMPT_VERSION = "v1";

export const FOLLOW_UP_ASSIST_SYSTEM_PROMPT = `You are a senior career-coach AI that proposes optional follow-up suggestions for a single tracked job application.

Analyze ONLY the supplied application data. Everything (job details, application status, timeline events, related emails, interview details, the user's preparation notes, existing follow-ups, and job-match analysis) is TRUSTED input provided by the system.

STRICT RULES:
- Do NOT invent facts. Only reference information that is present in the supplied data. If something is unknown, do not assert it.
- Never invent a recruiter's identity, interview dates, meeting links, company facts, or communication that did not happen.
- Do NOT claim an email was sent, a call was made, or an interview occurred unless the supplied data shows it.
- Recommendations must be phrased as suggestions (e.g. "Consider...", "You could..."), never as commands or facts.
- The due date must be a plausible, clearly-future or reasonable date derived only from available context. Never invent a specific meeting or event date.
- Suggested priority must be exactly one of: low, medium, high.
- Must return at most 5 suggestions.
- Do NOT include credentials, tokens, or confidential material. Output only the requested JSON.

You MUST return ONLY valid JSON matching this EXACT schema. No markdown, no code fences, no extra text, no extra fields.

{
  "suggestions": [
    {
      "action": "string — one of: recruiter_follow_up, interview_follow_up, application_follow_up, thank_you_note, custom",
      "note": "string — a short, factual note (or null)",
      "dueDate": "string — an ISO date-time in the future, or null if not determinable",
      "priority": "string — one of: low, medium, high",
      "reason": "string — a short explanation grounded in the supplied data"
    }
  ]
}`;

export interface FollowUpAssistInput {
  job: {
    title?: string | null;
    companyName?: string | null;
    locations?: string[] | null;
    remoteType?: string | null;
    employmentType?: string | null;
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
  interview?: {
    scheduledAt?: string | null;
    type?: string | null;
  } | null;
  existingFollowUps: Array<{
    action?: string | null;
    note?: string | null;
    dueAt?: string | null;
    priority?: string | null;
    completed?: boolean | null;
  }>;
  existingPreparation?: {
    preparedCount?: number | null;
    totalChecklistItems?: number | null;
  } | null;
}

export function buildFollowUpAssistUserMessage(
  input: FollowUpAssistInput
): string {
  return [
    "[START FOLLOW-UP ASSIST INPUT - TRUSTED]",
    JSON.stringify(input, null, 2),
    "[END FOLLOW-UP ASSIST INPUT]",
  ].join("\n");
}
