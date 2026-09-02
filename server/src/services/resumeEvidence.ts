import { ClaudeService } from "../integrations/claude/claude.service";
import { validateResumeEvidence } from "../validators/resumeEvidence";
import {
  ResumeDerivedEvidence,
  ResumeExtractionStatus,
  emptyResumeEvidence,
} from "./resumeTypes";

const claudeService = new ClaudeService();

/**
 * (Phase 2, Step 3) Convert bounded resume text into structured career evidence
 * for job matching. Deterministic parsing is the primary, non-throwing path;
 * an optional, Zod-validated AI pass supplements it. Resume-derived evidence
 * always SUPPLEMENTS (never overwrites) the user's trusted structured profile
 * data — see jobMatchProfile().
 */

const SKILL_KEYWORDS = [
  "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "C++", "C#",
  "Ruby", "PHP", "SQL", "Kotlin", "Swift", "Scala", "GraphQL", "REST",
];
const TECH_KEYWORDS = [
  "React", "Node.js", "Angular", "Vue", "Express", "Next.js", "Docker",
  "Kubernetes", "AWS", "Azure", "GCP", "PostgreSQL", "MongoDB", "Redis",
  "Kafka", "Terraform", "Git", "CI/CD", "Linux",
];
const DOMAIN_KEYWORDS = [
  "fintech", "healthcare", "e-commerce", "ecommerce", "saas", "ai", "machine learning",
  "data science", "devops", "mobile", "web",
];
const CERT_KEYWORDS = [
  "AWS Certified", "certified", "CKA", "CKS", "PMP", "Scrum", "Professional Engineer",
];

function matches(textLower: string, lexicon: string[]): string[] {
  const found = new Set<string>();
  for (const keyword of lexicon) {
    if (textLower.includes(keyword.toLowerCase())) {
      found.add(keyword);
    }
  }
  return [...found];
}

function matchRoles(text: string): string[] {
  const roles = new Set<string>();
  const roleLines = text.split(/\n/);
  const patterns = [
    /\b(?:Senior|Junior|Lead|Principal|Staff|Frontend|Backend|Full[\s-]?Stack|Software|DevOps|Data|Mobile|Web|Platform|Cloud)\s+(?:Engineer|Developer|Architect|Scientist|Analyst|Manager)\b/gi,
    /\b(?:Software|Full[\s-]?[Ss]tack|Frontend|Backend|DevOps|Data|Cloud|Mobile)\s+(?:Engineer|Developer)\b/gi,
  ];
  for (const line of roleLines) {
    for (const p of patterns) {
      const m = line.match(p);
      if (m && m[0].trim().length > 0) {
        roles.add(m[0].trim());
      }
    }
  }
  return [...roles].slice(0, 10);
}

function matchEmployers(text: string): string[] {
  const employers = new Set<string>();
  const atPattern = /\bat\s+([A-Z][A-Za-z0-9&.'\- ]{2,40})\b/g;
  let m: RegExpExecArray | null;
  while ((m = atPattern.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.toLowerCase() !== "the" && !/^(university|college)$/i.test(name)) {
      employers.add(name);
    }
  }
  return [...employers].slice(0, 10);
}

function matchYears(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function matchEducation(text: string): ResumeDerivedEvidence["education"] {
  const education: ResumeDerivedEvidence["education"] = [];
  const degreePattern =
    /(Bachelor(?:'s| of [A-Za-z]+)?|B\.?S\.?|B\.?A\.?|Master(?:'s| of [A-Za-z]+)?|M\.?S\.?|M\.?B\.?A\.?|Ph\.?D\.?|Doctorate|Associate(?:'s| degree)?)/gi;
  const institutionPattern =
    /(?:from|at)\s+([A-Z][A-Za-z0-9&.'\- ]{3,60}(?:University|College|Institute|School|Academy))/g;
  let m: RegExpExecArray | null;
  while ((m = degreePattern.exec(text)) !== null) {
    const degree = m[0].trim();
    const fromIdx = text.indexOf("from", m.index);
    const slice = text.slice(m.index, fromIdx > -1 ? fromIdx + 80 : m.index + 120);
    let institution: string | null = null;
    const im = slice.match(
      /(?:from|at)\s+([A-Z][A-Za-z0-9&.'\- ]{3,60}(?:University|College|Institute|School|Academy))/i
    );
    if (im) institution = im[1].trim();
    if (!education.some((e) => e.degree === degree)) {
      education.push({ degree, institution, field: null });
    }
  }
  void institutionPattern;
  return education.slice(0, 5);
}

function matchProjects(text: string): string[] {
  const projects: string[] = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 3 &&
      trimmed.length < 160 &&
      /\b(project|built|developed|created|designed|engineered|app|platform|system)\b/i.test(trimmed) &&
      !projects.includes(trimmed)
    ) {
      projects.push(trimmed);
    }
    if (projects.length >= 6) break;
  }
  return projects;
}

function matchAchievements(text: string): string[] {
  const achievements: string[] = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /\b(increased|reduced|improved|achieved|grew|led|delivered|launched|cut|boosted|saved)\b/i.test(trimmed) &&
      /%|\$\d|users|revenue|uptime|latency|performance/i.test(trimmed) &&
      trimmed.length < 200
    ) {
      achievements.push(trimmed);
    }
    if (achievements.length >= 8) break;
  }
  return achievements;
}

export function deriveResumeEvidenceFromText(text: string): ResumeDerivedEvidence {
  const textLower = (text || "").toLowerCase();
  const now = new Date();
  const evidence = emptyResumeEvidence("extracted", now);
  evidence.summary = (text || "").slice(0, 240) || null;
  evidence.skills = matches(textLower, SKILL_KEYWORDS);
  evidence.technologies = matches(textLower, TECH_KEYWORDS);
  evidence.domains = matches(textLower, DOMAIN_KEYWORDS);
  evidence.certifications = matches(text, CERT_KEYWORDS);
  evidence.roles = matchRoles(text);
  evidence.employers = matchEmployers(text);
  evidence.yearsExperience = matchYears(text);
  evidence.education = matchEducation(text);
  evidence.projects = matchProjects(text);
  evidence.achievements = matchAchievements(text);
  evidence.extraction.source = "deterministic";
  return evidence;
}

/**
 * Optional AI structured extraction with cross-provider fallback. Returns null
 * (never throws) when the AI is unavailable or its (Zod-validated) output is
 * invalid, so the deterministic evidence remains the safe fallback.
 */
export async function deriveResumeEvidenceWithAI(
  text: string,
  preferredProvider?: Parameters<ClaudeService["analyzeResumeEvidence"]>[1]
): Promise<ResumeDerivedEvidence | null> {
  try {
    if (!text || !text.trim()) return null;
    const raw = await claudeService.analyzeResumeEvidence(text, preferredProvider);
    const validation = validateResumeEvidence(raw);
    if (!validation.success) return null;
    const now = new Date();
    return {
      summary: validation.data.summary ?? null,
      skills: validation.data.skills ?? [],
      technologies: validation.data.technologies ?? [],
      roles: validation.data.roles ?? [],
      employers: validation.data.employers ?? [],
      yearsExperience: validation.data.yearsExperience ?? null,
      projects: validation.data.projects ?? [],
      achievements: validation.data.achievements ?? [],
      education: validation.data.education ?? [],
      certifications: validation.data.certifications ?? [],
      domains: validation.data.domains ?? [],
      extraction: { status: "extracted", source: "ai", extractedAt: now.toISOString() },
    };
  } catch {
    return null;
  }
}

/**
 * Build the best available derived evidence for resume text: deterministic
 * baseline, upgraded to validated AI output when available. Never throws.
 */
export async function deriveResumeEvidence(
  text: string,
  preferredProvider?: Parameters<ClaudeService["analyzeResumeEvidence"]>[1]
): Promise<ResumeDerivedEvidence> {
  const statusFor: ResumeExtractionStatus = text && text.trim()
    ? "extracted"
    : "empty";
  if (!text || !text.trim()) {
    return emptyResumeEvidence(statusFor);
  }
  const ai = await deriveResumeEvidenceWithAI(text, preferredProvider);
  return ai ?? deriveResumeEvidenceFromText(text);
}

export { emptyResumeEvidence };
