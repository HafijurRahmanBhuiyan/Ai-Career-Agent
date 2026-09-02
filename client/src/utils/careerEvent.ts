import type { LatestCareerEvent } from "../types/application";

const ICS_EVENT_LABELS: Record<string, string> = {
  interview: "Interview",
  screening: "Screening",
  shortlist: "Shortlisted",
  assessment: "Assessment",
  offer: "Offer",
  rejection: "Rejection",
  recruiter_contact: "Recruiter Contact",
  application_update: "Application Update",
};

function icsLabel(type: string | undefined): string {
  return (type && ICS_EVENT_LABELS[type]) || "Career Event";
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function icsUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function safeIcsId(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `career-${cleaned || "event"}@career-agent`;
}

/**
 * Builds an RFC 5545 iCalendar event for a scheduled career event.
 * Times are always emitted in UTC (scheduledAt is an explicit-offset ISO
 * string from the server); the calendar app renders them in the user's own
 * timezone, so the product never guesses a timezone.
 */
export function buildInterviewIcs(event: LatestCareerEvent): string | null {
  if (!event.scheduledAt) return null;

  const utcStart = icsUtc(event.scheduledAt);
  if (!utcStart) return null;

  const durationMs = (event.durationMinutes ?? 60) * 60 * 1000;
  const end = new Date(
    new Date(event.scheduledAt as string).getTime() + durationMs
  );
  const utcEnd = icsUtc(end.toISOString());

  const company = event.company || "";
  const role = event.role || "";
  const summaryParts = [`${icsLabel(event.type)}`];
  if (company) summaryParts.push(`at ${company}`);
  if (role) summaryParts.push(`(${role})`);

  const descriptionLines: string[] = [];
  if (event.interviewerName) {
    descriptionLines.push(`Interviewer: ${event.interviewerName}`);
  }
  if (event.meetingUrl) {
    descriptionLines.push(`Meeting link: ${event.meetingUrl}`);
  }
  if (event.location) {
    descriptionLines.push(`Location: ${event.location}`);
  }
  if (event.phone) {
    descriptionLines.push(`Phone: ${event.phone}`);
  }
  if (event.evidence) {
    descriptionLines.push(`Context: ${event.evidence}`);
  }

  const location =
    event.meetingUrl ||
    event.location ||
    event.phone ||
    "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Career Agent//Career Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${safeIcsId(`${company}-${event.scheduledAt}`)}`,
    "DTSTAMP:" + icsUtc(new Date().toISOString()),
    `DTSTART:${utcStart}`,
    `DTEND:${utcEnd}`,
    `SUMMARY:${icsEscape(summaryParts.join(" "))}`,
  ];
  if (descriptionLines.length > 0) {
    lines.push(`DESCRIPTION:${icsEscape(descriptionLines.join("\n"))}`);
  }
  if (location) {
    lines.push(`LOCATION:${icsEscape(location)}`);
  }
  if (company) {
    lines.push(`ORGANIZER;CN=${icsEscape(company)}:MAILTO:career-agent`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Human-friendly deadline urgency. Never guesses a timezone; all comparisons
 * are calendar-day local computations against the user's own clock.
 */
export function deadlineCountdown(
  deadlineAt: string | undefined | null
): string | null {
  if (!deadlineAt) return null;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return null;

  const today = startOfDay(new Date());
  const due = startOfDay(deadline);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    return Math.abs(days) === 1
      ? "overdue by 1 day"
      : `overdue by ${Math.abs(days)} days`;
  }
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/**
 * Deterministic, copy-to-clipboard reply drafts for scheduled/action-required
 * career events. The user composes and sends from their own inbox — the agent
 * never sends email on the user's behalf.
 */
export function buildReplyDraft(
  event: LatestCareerEvent
): string | null {
  if (!event || !event.type) return null;

  const company = event.company || "the team";
  const role = event.role || "the role";
  const when = event.scheduledAt
    ? formatDraftWhen(event.scheduledAt)
    : null;

  if (event.type === "offer") {
    return [
      `Re: Offer from ${company}`,
      "",
      `Thank you for extending the offer for ${role} at ${company}.`,
      event.deadlineAt
        ? `I will review the details and respond by ${formatDraftWhen(
            event.deadlineAt
          )} as requested.`
        : "I would like to review the details before responding.",
      "",
      "Please let me know if you need anything else from me.",
      "",
      "Best regards,",
      "[Your Name]",
    ].join("\n");
  }

  if (event.type === "assessment") {
    return [
      `Re: Assessment for ${role} at ${company}`,
      "",
      `Thank you for sending the assessment for ${role} at ${company}.`,
      event.deadlineAt
        ? `I will complete it by ${formatDraftWhen(event.deadlineAt)}.`
        : "I will complete it as soon as possible.",
      "",
      "Best regards,",
      "[Your Name]",
    ].join("\n");
  }

  if (
    (event.type === "interview" ||
      event.type === "screening" ||
      event.type === "shortlist") &&
    when
  ) {
    return [
      `Re: Confirming my ${event.type} at ${company}`,
      "",
      `Hi ${company} team,`,
      "",
      `Thank you for scheduling my ${event.type} for ${role} at ${company}.`,
      `I can confirm I am available at ${when}.`,
      "Please reach out if you need anything from me in advance.",
      "",
      "Best regards,",
      "[Your Name]",
    ].join("\n");
  }

  return null;
}

function formatDraftWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Deterministic, structured-data-only next-action hint for a career event.
 * Never fabricates an action: returns null whenever the stored event has no
 * concrete data backing the suggested step.
 */
export function careerActionHint(
  event: LatestCareerEvent | undefined | null
): string | null {
  if (!event?.type) return null;

  switch (event.type) {
    case "interview":
      if (event.scheduledAt) return "Prepare for interview";
      return null;
    case "offer":
      return "Review offer";
    case "assessment":
      if (event.actionRequired) return "Complete assessment";
      return null;
    case "screening":
    case "shortlist":
    case "recruiter_contact":
      return "Review message";
    default:
      return null;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}