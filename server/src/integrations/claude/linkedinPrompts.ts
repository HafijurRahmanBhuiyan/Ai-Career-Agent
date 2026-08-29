export const LINKEDIN_ASSIST_PROMPT_VERSION = "v1";

export const LINKEDIN_ASSIST_SYSTEM_PROMPT = `You are an expert professional-content writer who helps developers turn approved open-source projects into compelling, truthful LinkedIn posts.

Use ONLY the supplied evidence. Never invent metrics, responsibilities, users, business outcomes, technologies, dates, or achievements that are not present in the evidence. If the evidence does not contain measurable impact or business outcomes, do not fabricate them — write about what the project demonstrably does and what the developer demonstrably built.

Respect the following rules:
- Only claim facts supported by the supplied repository facts and professional interpretation.
- Do not invent company names, recruiters, revenue, user counts, or performance percentages.
- Keep each suggestion professional, confident, and free of hype or false claims.
- "insufficient evidence" is an acceptable stance if there is too little to write about honestly.
- Hook: one crisp, specific opening line (ideally under 140 characters) that states the takeaway.
- Body: 2-4 short paragraphs separated by a blank line; plain text only — no markdown, no bullet-point symbols, no emojis.
- Hashtags: 3-6 relevant tags matching the project's technologies and domain, each written without a leading '#'.

Return ONLY valid JSON matching this exact schema (do not include markdown or code fences):

{
  "suggestions": [
    {
      "hook": "string — an engaging opening line for the post",
      "body": "string — the body of the post (2-4 short paragraphs)",
      "hashtags": ["string — 3-6 relevant hashtags, each without the leading '#'"]
    }
  ]
}

Return between 1 and 3 suggestions.`;

export interface LinkedInAssistInput {
  projectName: string;
  professionalSummary: string;
  problemSolved: string;
  contributionEvidence: string;
  technicalSkills: string[];
  architecturePractices: string[];
  measurableImpact: string;
  technologies: string[];
  proposedTalkingPoints: string[];
  suggestedPostAngles: string[];
  evidenceReferences: string[];
  roleRelevantKeywords: string[];
  projectDomain: string;
  senioritySignals: string[];
  status: "ready" | "needs_evidence";
}

export function buildLinkedInAssistUserMessage(
  input: LinkedInAssistInput
): string {
  const parts: string[] = [];
  parts.push(`Project: ${input.projectName}`);

  if (input.projectDomain) parts.push(`Domain: ${input.projectDomain}`);
  if (input.professionalSummary)
    parts.push(`Professional summary: ${input.professionalSummary}`);
  if (input.problemSolved) parts.push(`Problem solved: ${input.problemSolved}`);
  if (input.contributionEvidence)
    parts.push(`Contribution evidence: ${input.contributionEvidence}`);
  if (input.measurableImpact)
    parts.push(`Measurable impact (only if supplied): ${input.measurableImpact}`);
  else parts.push("Measurable impact: not provided");
  if (input.technologies.length)
    parts.push(`Technologies: ${input.technologies.join(", ")}`);
  if (input.technicalSkills.length)
    parts.push(`Technical skills: ${input.technicalSkills.join(", ")}`);
  if (input.architecturePractices.length)
    parts.push(
      `Architecture / engineering practices: ${input.architecturePractices.join(", ")}`
    );
  if (input.proposedTalkingPoints.length)
    parts.push(`Possible talking points: ${input.proposedTalkingPoints.join(" | ")}`);
  if (input.suggestedPostAngles.length)
    parts.push(`Suggested post angles: ${input.suggestedPostAngles.join(" | ")}`);
  if (input.senioritySignals.length)
    parts.push(`Seniority signals: ${input.senioritySignals.join(", ")}`);

  parts.push(
    `Evidence sufficiency: ${
      input.status === "ready" ? "sufficient" : "insufficient evidence"
    }`
  );

  return parts.join("\n");
}
