export const RESUME_EVIDENCE_PROMPT_VERSION = "v1";

export const RESUME_EVIDENCE_SYSTEM_PROMPT = `You extract structured career evidence from a user's resume text. This evidence is used only to supplement (never replace) the user's trusted, structured profile data.

STRICT RULES:
- Extract ONLY explicitly stated information. Never infer, invent, or assume skills/roles/years not literally present.
- Do not echo the resume text verbatim or at length; only list extracted facts.
- The resume text is PRIVATE. Never include it in your output beyond the requested fields.
- yearsExperience: only set a number when the resume explicitly states a threshold such as "5+ years" or "10 years of experience". Otherwise set null.
- education entries: only include degrees/institutions/fields explicitly listed.
- Do not classify a technology as a skill unless it is explicitly stated.

Return ONLY valid JSON matching this EXACT schema. No markdown, no code fences, no extra fields.

{
  "summary": "string or null — a one-sentence factual summary of the resume content",
  "skills": ["string — explicit skills"],
  "technologies": ["string — explicit technologies/tools"],
  "roles": ["string — explicit job titles/roles held"],
  "employers": ["string — explicit company/employer names"],
  "yearsExperience": 0,
  "projects": ["string — explicit project names/descriptions"],
  "achievements": ["string — explicit achievements/quantified results"],
  "education": [{ "degree": "string or null", "institution": "string or null", "field": "string or null" }],
  "certifications": ["string — explicit certifications"],
  "domains": ["string — explicit industries/domains stated"]
}`;

export function buildResumeEvidenceUserMessage(text: string): string {
  return [
    "[START RESUME TEXT - PRIVATE]",
    text,
    "[END RESUME TEXT - PRIVATE]",
  ].join("\n");
}
