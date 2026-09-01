import { z } from "zod";
import { analyzeWithAIFallback } from "../integrations/ai/aiRouter";
import { AIProvider } from "../integrations/ai/ai.types";
import {
  EMAIL_CAREER_STATUS_PROMPT_VERSION,
  EMAIL_CAREER_STATUS_SYSTEM_PROMPT,
  buildEmailCareerStatusUserMessage,
} from "../integrations/claude/emailCareerStatusPrompts";
import {
  DETECTED_CAREER_STATUSES,
  DetectedCareerStatus,
} from "../models/CareerEmail";
import { HIGH_CONFIDENCE } from "./careerStatusTransitions";

export const EMAIL_CAREER_STATUS_VERSION = EMAIL_CAREER_STATUS_PROMPT_VERSION;

export const CAREER_STATUS_CATEGORIES = [
  "interview",
  "screening",
  "offer",
  "rejection",
  "application_update",
  "recruiter_contact",
  "irrelevant",
] as const;

export type CareerStatusCategory = (typeof CAREER_STATUS_CATEGORIES)[number];

const careerStatusSnapshot = z.enum(DETECTED_CAREER_STATUSES);

export const careerStatusSchema = z.object({
  category: z.enum(CAREER_STATUS_CATEGORIES),
  confidence: z.number().min(0).max(1),
  // Explicitly limited to forward-detectable stages. "applied" is only ever set
  // by the execution flow and "withdrawn" is never set automatically.
  status: careerStatusSnapshot.nullable(),
  companyName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  actionRequired: z.boolean().nullable(),
  summary: z.string(),
  evidence: z.string().nullable(),
  reason: z.string().nullable(),
});

export type CareerStatusClassification = z.infer<typeof careerStatusSchema>;

export interface CareerStatusEmailInput {
  subject?: string;
  from?: string;
  body?: string;
  snippet?: string;
  companyName?: string | null;
  jobTitle?: string | null;
}

const STATUS_ONLY_CATEGORIES = new Set<CareerStatusCategory>([
  "screening",
  "interview",
  "offer",
  "rejection",
]);

interface DetectionRule {
  category: CareerStatusCategory;
  status: DetectedCareerStatus | null;
  confidence: number;
  phrases: string[];
  needsCareerContext?: boolean;
}

// Priority order - also the tie-breaker when two rules match equal confidence.
const RULES: DetectionRule[] = [
  {
    category: "offer",
    status: "offer",
    confidence: 0.9,
    phrases: [
      "pleased to offer you",
      "pleased to offer",
      "we are excited to offer",
      "we are pleased to offer",
      "we would like to offer",
      "we'd like to offer",
      "would like to offer you",
      "offer you the position",
      "offer you the role",
      "offer you the job",
      "offer for the position",
      "extend an offer",
      "extending an offer",
      "extended you an offer",
      "offer of employment",
      "employment offer",
      "job offer",
      "official offer",
      "offer letter",
      "accept our offer",
    ],
  },
  {
    category: "rejection",
    status: "rejected",
    confidence: 0.9,
    needsCareerContext: true,
    phrases: [
      "regret to inform you",
      "regret to inform",
      "we will not be moving forward",
      "not moving forward with your application",
      "decided to move forward with another",
      "moving forward with other candidates",
      "another candidate was selected",
      "we have selected another candidate",
      "your application was unsuccessful",
      "application has been unsuccessful",
      "was not successful this time",
      "unsuccessful on this occasion",
      "not selected for",
      "we are unable to offer you",
      "position has been filled",
      "position has already been filled",
      "decided not to proceed",
      "will not proceed with your application",
      "we will be pursuing other candidates",
    ],
  },
  {
    category: "interview",
    status: "interview",
    confidence: 0.9,
    phrases: [
      "interview invitation",
      "invite you to an interview",
      "invite you for an interview",
      "invitation to an interview",
      "invitation to interview",
      "interview is scheduled",
      "interview scheduled",
      "schedule an interview",
      "scheduled an interview",
      "scheduling an interview",
      "interview with",
      "interview at",
      "interview for the",
      "interview for a",
      "interview will be",
      "phone interview",
      "video interview",
      "onsite interview",
      "technical interview",
      "coding interview",
      "panel interview",
      "first-round interview",
      "first round interview",
      "next-round interview",
      "next round interview",
      "interview call",
    ],
  },
  {
    category: "interview",
    status: "interview",
    confidence: 0.65,
    phrases: [
      "move forward with your application",
      "moving forward with your application",
      "to move forward",
      "next steps",
      "take the next step",
    ],
  },
  {
    category: "screening",
    status: "screening",
    confidence: 0.85,
    phrases: [
      "you have been shortlisted",
      "shortlisted for",
      "shortlisted",
      "shortlist for",
    ],
  },
  {
    category: "screening",
    status: "screening",
    confidence: 0.7,
    phrases: [
      "phone screen",
      "screening call",
      "screening interview",
      "screen call",
      "preliminary call",
      "preliminary screening",
      "initial phone screen",
      "initial screen",
      "recruiter screen",
      "quick call to",
      "quick chat to",
    ],
  },
  {
    category: "application_update",
    status: null,
    confidence: 0.6,
    phrases: [
      "we have received your application",
      "received your application",
      "your application has been received",
      "application has been received",
      "application received",
      "your application is under review",
      "under review",
      "update regarding your application",
      "regarding your application",
      "status of your application",
      "your candidacy",
      "application update",
      "reviewing your application",
      "progress of your application",
    ],
  },
  {
    category: "recruiter_contact",
    status: null,
    confidence: 0.6,
    phrases: [
      "found your profile",
      "saw your profile",
      "we came across your profile",
      "came across your profile",
      "we are hiring",
      "we have an opening",
      "job opportunity",
      "career opportunity",
      "interesting opportunity for you",
      "you would be a great fit",
      "you'd be a great fit",
      "are you looking for",
      "welcome to apply",
      "recruiter from",
      "talent team",
    ],
  },
];

const CAREER_CONTEXT_WORDS = [
  "application",
  "candidacy",
  "candidate",
  "position",
  "role",
  "interview",
  "screening",
  "process",
  "vacancy",
  "resume",
  "profile",
];

// The first ~1200 chars of the body are the working region. Footer,
// disclaimer, sponsorship and newsletter noise normally appears past this
// point, so it can never trigger a status detection.
const BODY_SCAN_CHARS = 1200;

export function classifyCareerStatusDeterministic(
  email: CareerStatusEmailInput
): CareerStatusClassification {
  const subject = (email.subject || "").toLowerCase();
  const snippet = (email.snippet || "").toLowerCase();
  const bodyHead = (email.body || "").slice(0, BODY_SCAN_CHARS).toLowerCase();
  const head = [subject, snippet, bodyHead]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!head) {
    return buildIrrelevant("Email had no readable subject or body.");
  }

  const matches: { rule: DetectionRule; phrase: string; index: number }[] = [];
  for (let ruleIndex = 0; ruleIndex < RULES.length; ruleIndex += 1) {
    const rule = RULES[ruleIndex];
    for (const phrase of rule.phrases) {
      const index = head.indexOf(phrase);
      if (index === -1) continue;
      if (rule.needsCareerContext) {
        const hasContext = CAREER_CONTEXT_WORDS.some((word) =>
          head.includes(word)
        );
        if (!hasContext) continue;
      }
      matches.push({ rule, phrase, index });
      break;
    }
  }

  if (matches.length === 0) {
    return buildIrrelevant("No hiring-stage wording was found in the email.");
  }

  matches.sort((a, b) => {
    if (b.rule.confidence !== a.rule.confidence) {
      return b.rule.confidence - a.rule.confidence;
    }
    return a.index - b.index;
  });

  const best = matches[0];
  const rule = best.rule;

  const companyName = email.companyName || companyFromSender(email.from) || null;
  const status = rule.status;
  const summary = `${rule.category.replace("_", " ")} detected via "${best.phrase}".`;
  const reason = `Matched "${best.phrase}" -> ${rule.category} (status ${
    status ?? "no change"
  }), confidence ${rule.confidence}.`;

  return {
    category: rule.category,
    confidence: clampConfidence(rule.confidence),
    status,
    companyName,
    jobTitle: email.jobTitle || null,
    actionRequired: null,
    summary,
    evidence: best.phrase,
    reason,
  };
}

export async function classifyCareerStatusWithAI(
  email: CareerStatusEmailInput,
  preferredProvider?: AIProvider
): Promise<CareerStatusClassification | null> {
  try {
    const userMessage = buildEmailCareerStatusUserMessage(email);
    const response = await analyzeWithAIFallback(
      {
        systemPrompt: EMAIL_CAREER_STATUS_SYSTEM_PROMPT,
        userMessage,
      },
      preferredProvider
    );

    const parsed = parseJsonText(response.text);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const coerced: Record<string, unknown> = {
      category: String(record.category || "irrelevant"),
      confidence:
        typeof record.confidence === "number"
          ? record.confidence
          : Number(record.confidence) || 0,
      status: isDetectedStatus(record.status) ? record.status : null,
      companyName:
        typeof record.companyName === "string" && record.companyName
          ? record.companyName
          : null,
      jobTitle:
        typeof record.jobTitle === "string" && record.jobTitle
          ? record.jobTitle
          : null,
      actionRequired:
        typeof record.actionRequired === "boolean"
          ? record.actionRequired
          : null,
      summary: typeof record.summary === "string" ? record.summary : "",
      evidence:
        typeof record.evidence === "string" && record.evidence
          ? record.evidence
          : null,
      reason: typeof record.reason === "string" ? record.reason : null,
    };

    const validated = careerStatusSchema.safeParse(coerced);
    if (!validated.success) {
      return null;
    }
    return sanitizeAiStatus(validated.data);
  } catch {
    // AI is best-effort: any provider failure or invalid payload falls back to
    // the deterministic result and must never break the Gmail sync.
    return null;
  }
}

/**
 * Deterministic-first resolution:
 * - An explicit deterministic signal (>= HIGH confidence) is authoritative and
 *   skips the AI call entirely.
 * - Otherwise the structured AI classifier (existing Claude -> Gemini -> OpenAI
 *   fallback router, validated with Zod) is consulted and may upgrade the
 *   result. Invalid/missing AI output falls back to the deterministic result.
 */
export async function resolveCareerStatus(
  email: CareerStatusEmailInput,
  preferredProvider?: AIProvider
): Promise<CareerStatusClassification> {
  const deterministic = classifyCareerStatusDeterministic(email);

  if (deterministic.confidence >= HIGH_CONFIDENCE) {
    return deterministic;
  }

  const ai = await classifyCareerStatusWithAI(email, preferredProvider);

  if (ai && ai.confidence > deterministic.confidence) {
    return {
      ...ai,
      companyName: ai.companyName || deterministic.companyName,
      jobTitle: ai.jobTitle || deterministic.jobTitle,
    };
  }

  return deterministic;
}

function sanitizeAiStatus(
  value: CareerStatusClassification
): CareerStatusClassification {
  if (!STATUS_ONLY_CATEGORIES.has(value.category)) {
    return { ...value, status: null };
  }
  return value;
}

function isDetectedStatus(value: unknown): value is DetectedCareerStatus {
  return (
    typeof value === "string" &&
    (DETECTED_CAREER_STATUSES as readonly string[]).includes(value)
  );
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildIrrelevant(reason: string): CareerStatusClassification {
  return {
    category: "irrelevant",
    confidence: 0.2,
    status: null,
    companyName: null,
    jobTitle: null,
    actionRequired: null,
    summary: "No hiring-stage signal detected.",
    evidence: null,
    reason,
  };
}

function parseJsonText(raw: string): unknown {
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
    return null;
  }
}

function companyFromSender(from?: string): string | null {
  if (!from || !from.includes("@")) return null;
  const at = from.lastIndexOf("@");
  let rest = from.slice(at + 1).trim();
  rest = rest.replace(/[>),;\s]/g, "").trim();
  if (!rest) return null;
  const labels = rest.split(".").filter(Boolean);
  if (labels.length === 0) return null;
  let idx = labels.length - 1;
  if (idx > 0) {
    const last = labels[idx];
    const secondLast = labels[idx - 1];
    if (last.length !== 2 || secondLast.length !== 2) {
      idx -= 1;
    } else {
      idx -= 2;
    }
  }
  if (idx < 0) idx = 0;
  const label = labels[idx];
  return label || null;
}