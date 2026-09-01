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
}
