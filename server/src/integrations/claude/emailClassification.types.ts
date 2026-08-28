export const EMAIL_CATEGORIES = [
  "recruiter_outreach",
  "application_received",
  "application_update",
  "interview_invitation",
  "interview_reschedule",
  "assessment",
  "rejection",
  "offer",
  "follow_up",
  "networking",
  "unrelated",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const SUGGESTED_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type SuggestedApplicationStatus = (typeof SUGGESTED_STATUSES)[number];

export interface EmailInterviewClassification {
  type?: string | null;
  scheduledAt?: string | null;
  interviewer?: string | null;
  meetingUrl?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface EmailClassification {
  category: EmailCategory;
  confidence: number;
  summary: string;
  companyName: string | null;
  jobTitle: string | null;
  applicationStatus: SuggestedApplicationStatus | null;
  interviewDate: string | null;
  interviewType: string | null;
  actionRequired: boolean | null;
  actionDeadline: string | null;
  interview?: EmailInterviewClassification | null;
  extractedApplicationHints: {
    companyName?: string | null;
    jobTitle?: string | null;
  };
}
