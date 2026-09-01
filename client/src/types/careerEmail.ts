export type CareerEmailCategory =
  | "recruiter_outreach"
  | "application_received"
  | "application_update"
  | "interview_invitation"
  | "interview_reschedule"
  | "assessment"
  | "rejection"
  | "offer"
  | "follow_up"
  | "networking"
  | "unrelated";

export type DetectedCareerStatus = "screening" | "interview" | "offer" | "rejected";

export type CareerEventType =
  | "interview"
  | "screening"
  | "assessment"
  | "shortlist"
  | "offer"
  | "rejection"
  | "recruiter_contact"
  | "application_update";

export interface CareerEvent {
  type?: CareerEventType;
  confidence?: number | null;
  title?: string | null;
  company?: string | null;
  role?: string | null;
  scheduledAt?: string | null;
  timezone?: string | null;
  durationMinutes?: number | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
  meetingUrl?: string | null;
  meetingPlatform?: string | null;
  location?: string | null;
  phone?: string | null;
  deadlineAt?: string | null;
  deadlineTimezone?: string | null;
  actionRequired?: boolean | null;
  actionText?: string | null;
  candidateResponseRequired?: boolean | null;
  evidence?: string | null;
  detectedAt?: string | null;
}

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface CareerEmailLinkedApplication {
  _id: string;
  status?: ApplicationStatus;
}

export interface CareerEmail {
  id: string;
  gmailMessageId: string;
  threadId?: string;
  from?: string;
  to?: string;
  subject?: string;
  receivedAt?: string;
  snippet?: string;
  category?: CareerEmailCategory;
  confidence?: number;
  summary?: string;
  companyName?: string;
  jobTitle?: string;
  suggestedApplicationStatus?: ApplicationStatus | null;
  interviewDate?: string;
  interviewType?: string;
  actionRequired?: boolean;
  actionDeadline?: string;
  extractedApplicationHints?: Record<string, unknown>;
  application?: CareerEmailLinkedApplication | null;
  classificationStatus?: "classified" | "failed";
  classifiedAt?: string;
  careerStatus?: DetectedCareerStatus | null;
  careerStatusConfidence?: number | null;
  careerStatusDetectedAt?: string | null;
  autoStatusApplied?: boolean;
  autoStatusReason?: string | null;
  manualStatusApplied?: boolean;
  manualStatusAppliedAt?: string | null;
  manualStatusReason?: string | null;
  careerEvent?: CareerEvent | null;
  createdAt: string;
  updatedAt: string;
}

export interface CareerEmailPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GmailStatus {
  connected: boolean;
  gmail?: {
    email: string;
    isActive: boolean;
    connectedAt: string;
    lastSyncedAt?: string | null;
  };
}

export interface GmailSyncResult {
  synced: number;
  careerEmails: number;
  classified: number;
  skipped: number;
  failed: number;
  autoUpdated: number;
  careerEvents: number;
}
