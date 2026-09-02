import { z } from "zod";
import { analyzeWithAIFallback } from "../integrations/ai/aiRouter";
import { AIProvider } from "../integrations/ai/ai.types";
import {
  EMAIL_CAREER_EVENT_PROMPT_VERSION,
  EMAIL_CAREER_EVENT_SYSTEM_PROMPT,
  buildEmailCareerEventUserMessage,
} from "../integrations/claude/careerEventExtractionPrompts";
import { EmailClassification } from "../integrations/claude/emailClassification.types";
import {
  CAREER_EVENT_TYPES,
  CareerEventType,
} from "../models/CareerEmail";
import { CareerStatusClassification } from "./careerStatusDetection";
import { HIGH_CONFIDENCE } from "./careerStatusTransitions";

export const EMAIL_CAREER_EVENT_VERSION = EMAIL_CAREER_EVENT_PROMPT_VERSION;

export interface CareerEventExtractionInput {
  subject?: string;
  from?: string;
  body?: string;
  snippet?: string;
  companyName?: string | null;
  jobTitle?: string | null;
}

export interface CareerEventExtraction {
  type: CareerEventType;
  confidence: number;
  title?: string | null;
  company?: string | null;
  role?: string | null;
  scheduledAt?: Date | null;
  timezone?: string | null;
  durationMinutes?: number | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
  meetingUrl?: string | null;
  meetingPlatform?: string | null;
  location?: string | null;
  phone?: string | null;
  deadlineAt?: Date | null;
  deadlineTimezone?: string | null;
  actionRequired?: boolean | null;
  actionText?: string | null;
  candidateResponseRequired?: boolean | null;
  evidence?: string | null;
  detectedAt: Date;
}

// JSON-level schema used to validate AI output before it is converted into a
// stored subdocument. Dates arrive as ISO strings and are only kept when they
// carry an explicit timezone offset (see parseTzAwareIso).
const careerEventExtractionSchema = z.object({
  type: z.enum(CAREER_EVENT_TYPES).nullable(),
  confidence: z.number().min(0).max(1),
  title: z.string().nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  timezone: z.string().nullable(),
  durationMinutes: z.number().int().min(0).max(10080).nullable(),
  interviewerName: z.string().nullable(),
  interviewerEmail: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  meetingPlatform: z.string().nullable(),
  location: z.string().nullable(),
  phone: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  deadlineTimezone: z.string().nullable(),
  actionRequired: z.boolean().nullable(),
  actionText: z.string().nullable(),
  candidateResponseRequired: z.boolean().nullable(),
  evidence: z.string().nullable(),
});

type CareerEventExtractionJson = z.infer<typeof careerEventExtractionSchema>;

const STATUS_DRIVEN_TYPES = new Map<
  CareerStatusClassification["category"],
  EventTypeResult
>([
  ["offer", { type: "offer", confidence: 0.9 }],
  ["rejection", { type: "rejection", confidence: 0.9 }],
  ["interview", { type: "interview", confidence: 0.85 }],
  ["screening", { type: "screening", confidence: 0.7 }],
  ["application_update", { type: "application_update", confidence: 0.55 }],
  ["recruiter_contact", { type: "recruiter_contact", confidence: 0.55 }],
]);

interface EventTypeResult {
  type: CareerEventType;
  confidence: number;
}

const CLASSIFICATION_DRIVEN_TYPES = new Map<
  EmailClassification["category"],
  EventTypeResult
>([
  ["offer", { type: "offer", confidence: 0.9 }],
  ["rejection", { type: "rejection", confidence: 0.9 }],
  ["interview_invitation", { type: "interview", confidence: 0.85 }],
  ["interview_reschedule", { type: "interview", confidence: 0.85 }],
  ["assessment", { type: "assessment", confidence: 0.7 }],
  ["recruiter_outreach", { type: "recruiter_contact", confidence: 0.55 }],
  ["application_update", { type: "application_update", confidence: 0.55 }],
]);

const ASSESSMENT_PHRASES = [
  "coding challenge",
  "coding assessment",
  "take-home",
  "take home",
  "takehome",
  "technical assessment",
  "technical test",
  "online assessment",
  "hackerrank",
  "codility",
  "assignment",
];

const MEETING_PLATFORMS: Array<[RegExp, string]> = [
  [/meet\.google\.com/i, "google meet"],
  [/zoom\.us|zoom\.com/i, "zoom"],
  [/teams\.microsoft\.com|\.teams\.live\.com/i, "microsoft teams"],
  [/webex\.com|\.webex\.ai/i, "webex"],
  [/whereby\.com/i, "whereby"],
  [/calendly\.com/i, "calendly"],
  [/gotomeeting\.com|goto\.me/i, "gotomeeting"],
  [/streamyard\.com|hopin\.com/i, "streamyard"],
];

// The first ~1200 chars of the body are the working region for deterministic
// scans. Footer, disclaimer, sponsorship and newsletter noise normally appears
// past this point, so it can never drive an event extraction.
const BODY_SCAN_CHARS = 1200;

/**
 * Deterministic career-event extraction. Blends the already-resolved
 * careerStatus, the existing email classification, and a few conservative
 * body scans. Never fabricates: anything that cannot be anchored to the email
 * is left null.
 */
export function extractCareerEventDeterministic(
  email: CareerEventExtractionInput,
  careerStatus: CareerStatusClassification | null,
  classification: EmailClassification
): CareerEventExtraction | null {
  const subject = (email.subject || "").toLowerCase();
  const snippet = (email.snippet || "").toLowerCase();
  const bodyHead = (email.body || "").slice(0, BODY_SCAN_CHARS).toLowerCase();
  const head = [subject, snippet, bodyHead]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const statusType =
    careerStatus && careerStatus.status
      ? STATUS_DRIVEN_TYPES.get(careerStatus.category)
      : undefined;
  const classificationType = CLASSIFICATION_DRIVEN_TYPES.get(
    classification.category
  );
  const bodyType = detectAssessment(head);

  let event: EventTypeResult | undefined =
    statusType ||
    classificationType ||
    bodyType;

  if (!event) {
    return null;
  }

  if (event.type === "screening" && /\bshortlist(ed)?\b/.test(head)) {
    event = { type: "shortlist", confidence: 0.7 };
  }

  const company =
    careerStatus?.companyName || email.companyName || null;
  const role = careerStatus?.jobTitle || email.jobTitle || null;

  const interview = classification.interview;
  const interviewScheduledRaw =
    interview?.scheduledAt || classification.interviewDate;
  const scheduledAt = interviewScheduledRaw
    ? parseTzAwareIso(interviewScheduledRaw)
    : null;
  const meetingUrl = sanitizeMeetingUrl(
    interview?.meetingUrl || scanMeetingUrl(head) || null
  );
  const deadlineAt = classification.actionDeadline
    ? parseTzAwareIso(classification.actionDeadline)
    : null;

  const detectedAt = new Date();
  const evidence =
    careerStatus?.evidence ||
    (careerStatus ? careerStatus.reason : null) ||
    classification.summary ||
    null;

  const extraction: CareerEventExtraction = {
    type: event.type,
    confidence: clampConfidence(event.confidence),
    title: buildEventTitle(event.type, company, role, classification.summary),
    company,
    role,
    scheduledAt,
    timezone:
      interviewScheduledRaw && !scheduledAt
        ? extractionTimezone(interviewScheduledRaw)
        : null,
    durationMinutes: null,
    interviewerName: interview?.interviewer || null,
    interviewerEmail: null,
    meetingUrl,
    meetingPlatform: meetingUrl ? platformForUrl(meetingUrl) : null,
    location: interview?.location || null,
    phone: scanPhone(head),
    deadlineAt,
    deadlineTimezone: classification.actionDeadline && !deadlineAt
      ? extractionTimezone(classification.actionDeadline)
      : null,
    actionRequired: classification.actionRequired ?? null,
    actionText:
      classification.actionRequired === true
        ? truncate(classification.summary || null, 500)
        : null,
    candidateResponseRequired: classification.actionRequired ?? null,
    evidence,
    detectedAt,
  };

  return compact(extraction);
}

/**
 * Deterministic-first resolution:
 * - A strong deterministic signal (>= HIGH confidence) is authoritative and
 *   skips the AI call entirely.
 * - Otherwise the structured AI extractor (existing Claude -> Gemini -> OpenAI
 *   fallback router, validated with Zod) may upgrade the result. Malformed or
 *   missing AI output falls back to the deterministic result.
 * - Emails with no career signal at all return null without spending AI calls.
 */
export async function resolveCareerEventExtraction(
  email: CareerEventExtractionInput,
  careerStatus: CareerStatusClassification | null,
  classification: EmailClassification,
  preferredProvider?: AIProvider
): Promise<CareerEventExtraction | null> {
  const deterministic = extractCareerEventDeterministic(
    email,
    careerStatus,
    classification
  );

  const baseSignal =
    careerStatus && careerStatus.category !== "irrelevant";
  const classificationSignal =
    classification.category !== "unrelated" &&
    classification.category !== "networking" &&
    classification.category !== "follow_up";

  if (!baseSignal && !classificationSignal) {
    return deterministic;
  }

  if (deterministic && deterministic.confidence >= HIGH_CONFIDENCE) {
    return deterministic;
  }

  const ai = await extractCareerEventWithAI(email, preferredProvider);

  if (ai && deterministic) {
    return {
      ...ai,
      confidence: ai.confidence,
      company: ai.company || deterministic.company || email.companyName || null,
      role: ai.role || deterministic.role || email.jobTitle || null,
    };
  }

  if (ai && !deterministic) {
    return ai;
  }

  return deterministic;
}

async function extractCareerEventWithAI(
  email: CareerEventExtractionInput,
  preferredProvider?: AIProvider
): Promise<CareerEventExtraction | null> {
  try {
    const userMessage = buildEmailCareerEventUserMessage(email);
    const response = await analyzeWithAIFallback(
      {
        systemPrompt: EMAIL_CAREER_EVENT_SYSTEM_PROMPT,
        userMessage,
      },
      preferredProvider
    );

    const parsed = parseJsonText(response.text);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const coerced: Record<string, unknown> = {
      type: isCareerEventType((parsed as Record<string, unknown>).type)
        ? (parsed as Record<string, unknown>).type
        : null,
      confidence:
        typeof (parsed as Record<string, unknown>).confidence === "number"
          ? (parsed as Record<string, unknown>).confidence
          : 0,
      title: optionalString((parsed as Record<string, unknown>).title),
      company: optionalString((parsed as Record<string, unknown>).company),
      role: optionalString((parsed as Record<string, unknown>).role),
      scheduledAt: optionalString((parsed as Record<string, unknown>).scheduledAt),
      timezone: optionalString((parsed as Record<string, unknown>).timezone),
      durationMinutes:
        typeof (parsed as Record<string, unknown>).durationMinutes === "number"
          ? (parsed as Record<string, unknown>).durationMinutes
          : null,
      interviewerName: optionalString(
        (parsed as Record<string, unknown>).interviewerName
      ),
      interviewerEmail: optionalString(
        (parsed as Record<string, unknown>).interviewerEmail
      ),
      meetingUrl: optionalString((parsed as Record<string, unknown>).meetingUrl),
      meetingPlatform: optionalString(
        (parsed as Record<string, unknown>).meetingPlatform
      ),
      location: optionalString((parsed as Record<string, unknown>).location),
      phone: optionalString((parsed as Record<string, unknown>).phone),
      deadlineAt: optionalString((parsed as Record<string, unknown>).deadlineAt),
      deadlineTimezone: optionalString(
        (parsed as Record<string, unknown>).deadlineTimezone
      ),
      actionRequired: nullableBoolean(
        (parsed as Record<string, unknown>).actionRequired
      ),
      actionText: optionalString((parsed as Record<string, unknown>).actionText),
      candidateResponseRequired: nullableBoolean(
        (parsed as Record<string, unknown>).candidateResponseRequired
      ),
      evidence: optionalString((parsed as Record<string, unknown>).evidence),
    };

    const validated = careerEventExtractionSchema.safeParse(coerced);
    if (!validated.success) {
      return null;
    }
    return sanitizeAiExtraction(validated.data);
  } catch {
    // AI is best-effort: any provider failure or invalid payload falls back to
    // the deterministic result and must never break the Gmail sync.
    return null;
  }
}

function sanitizeAiExtraction(
  value: CareerEventExtractionJson
): CareerEventExtraction | null {
  if (!value.type) {
    return null;
  }

  const scheduledAt = parseTzAwareIso(value.scheduledAt);
  const deadlineAt = parseTzAwareIso(value.deadlineAt);
  const meetingUrl = sanitizeMeetingUrl(value.meetingUrl);

  const extraction: CareerEventExtraction = {
    type: value.type,
    confidence: clampConfidence(value.confidence),
    title: truncate(value.title, 500),
    company: truncate(value.company, 300),
    role: truncate(value.role, 300),
    scheduledAt,
    timezone: truncate(value.timezone || extractionTimezone(value.scheduledAt), 120),
    durationMinutes: value.durationMinutes,
    interviewerName: truncate(value.interviewerName, 300),
    interviewerEmail: sanitizeInterviewerEmail(value.interviewerEmail),
    meetingUrl,
    meetingPlatform:
      value.meetingPlatform || (meetingUrl ? platformForUrl(meetingUrl) : null),
    location: truncate(value.location, 500),
    phone: sanitizePhone(value.phone),
    deadlineAt,
    deadlineTimezone: truncate(
      value.deadlineTimezone || extractionTimezone(value.deadlineAt),
      120
    ),
    actionRequired: value.actionRequired,
    actionText: truncate(value.actionText, 500),
    candidateResponseRequired: value.candidateResponseRequired,
    evidence: truncate(value.evidence, 500),
    detectedAt: new Date(),
  };

  return compact(extraction);
}

function detectAssessment(head: string): EventTypeResult | undefined {
  if (ASSESSMENT_PHRASES.some((phrase) => head.includes(phrase))) {
    return { type: "assessment", confidence: 0.7 };
  }
  return undefined;
}

function buildEventTitle(
  type: CareerEventType,
  company: string | null,
  role: string | null,
  summary?: string
): string {
  const label = type.replace(/_/g, " ");
  const at = company ? ` at ${company}` : "";
  const as = role ? ` (${role})` : "";
  const base = `${label.charAt(0).toUpperCase()}${label.slice(1)}${at}${as}`;
  if (base.length <= 200) return base;
  const candidate = summary
    ? truncate(`${label}${at}${as}`, 200)
    : truncate(base, 200);
  return candidate ?? base.slice(0, 200);
}

function extractionTimezone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tz = raw.trim().slice(0, 120);
  return tz || null;
}

function sanitizeMeetingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/["'<>]|,\s*$/g, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return truncate(url.href, 1000);
}

function scanMeetingUrl(head: string): string | null {
  const urls = head.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  for (const raw of urls) {
    const clean = raw.replace(/[.,;:!?]+$/, "");
    const sanitized = sanitizeMeetingUrl(clean);
    if (!sanitized) continue;
    if (MEETING_PLATFORMS.some(([pattern]) => pattern.test(sanitized))) {
      return sanitized;
    }
  }
  return null;
}

function platformForUrl(url: string): string | null {
  for (const [pattern, platform] of MEETING_PLATFORMS) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

function scanPhone(head: string): string | null {
  const match = head.match(
    /(\+?\d{1,3}[\s-]?)?(\(\d{2,4}\)[\s-]?)?(\d{3}[\s-]?\d{3,4})([\s-]\d{2,4})?/
  );
  if (!match) return null;
  const digits = (match[0] || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return sanitizePhone(match[0]);
}

function sanitizeInterviewerEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return null;
  return truncate(value, 300);
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+()\s-]/g, "").trim().slice(0, 100);
  return cleaned || null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isCareerEventType(value: unknown): value is CareerEventType {
  return (
    typeof value === "string" &&
    (CAREER_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// Removes fields whose values are null so the stored subdocument stays tidy and
// clearly "extracted vs absent".
function compact(
  extraction: CareerEventExtraction
): CareerEventExtraction {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extraction)) {
    if (value !== undefined && value !== null) {
      output[key] = value;
    }
  }
  return output as unknown as CareerEventExtraction;
}

export function parseJsonText(raw: string): unknown {
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

/**
 * Strict, conservative date parsing for career events. Only timestamps that
 * carry an explicit timezone offset or Z/UTC suffix are accepted; any naive or
 * ambiguous timestamp returns null so the timezone is never guessed. When a raw
 * value is timezone-aware but unparsable, null is returned and the original
 * text is preserved in the timezone field by callers.
 */
export function parseTzAwareIso(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/\d{4}-\d{1,2}-\d{1,2}/.test(value)) return null;
  const hasExplicitOffset =
    /[+-]\d{2}:?\d{2}$/.test(value) || /z$/i.test(value);
  if (!hasExplicitOffset) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}