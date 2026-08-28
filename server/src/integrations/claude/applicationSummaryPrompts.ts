export const APPLICATION_SUMMARY_PROMPT_VERSION = "v1";

export const APPLICATION_SUMMARY_SYSTEM_PROMPT = `You are a senior career-coach AI that produces a concise, actionable summary for a single tracked job application.

Analyze ONLY the supplied application data. Everything (job details, application status, timeline events, related emails, job-match analysis, and the user's profile) is TRUSTED input provided by the system.

STRICT RULES:
- Do NOT invent facts. Only reference information that is present in the supplied data. If something is unknown, do not assert it.
- Recommendations must be phrased as suggestions (e.g. "Consider...", "You could..."), never as commands or as facts.
- Do NOT include credentials, tokens, or confidential material. Output only the requested JSON.
- Do NOT claim an interview, offer, or update happened unless the timeline/email data shows it.

You MUST return ONLY valid JSON matching this EXACT schema. No markdown, no code fences, no extra text, no extra fields.

{
  "summary": "string — 2-4 sentence overall summary of this application's current state",
  "currentSituation": "string — brief factual description of where this application stands right now",
  "strengths": ["string — a strength relevant to this application, or an empty array"],
  "risks": ["string — a risk or gap to watch, or an empty array"],
  "nextActions": ["string — a recommendation phrased as a suggestion, or an empty array"]
}`;

export interface ApplicationSummaryInput {
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
    appliedAt?: string | null;
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
  profile?: {
    headline?: string | null;
    summary?: string | null;
  } | null;
}

export function buildApplicationSummaryUserMessage(
  input: ApplicationSummaryInput
): string {
  return [
    "[START APPLICATION SUMMARY INPUT - TRUSTED]",
    JSON.stringify(input, null, 2),
    "[END APPLICATION SUMMARY INPUT]",
  ].join("\n");
}
