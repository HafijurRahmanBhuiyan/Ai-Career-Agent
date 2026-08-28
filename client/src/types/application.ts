export type ApplicationStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface ApplicationJob {
  _id?: string;
  title?: string;
  companyName?: string;
  location?: string | null;
  locations?: string[];
  remoteType?: string;
  employmentType?: string;
  source?: string;
}

export interface Application {
  _id: string;
  job?: ApplicationJob;
  status: ApplicationStatus;
  appliedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type TimelineEventType =
  | "application_created"
  | "status_changed"
  | "interview_scheduled"
  | "recruiter_contact"
  | "assessment"
  | "offer_received"
  | "rejection_received"
  | "note"
  | "other";

export type TimelineEventSource = "user" | "gmail" | "system";

export interface TimelineEvent {
  id: string;
  application?: string;
  type: TimelineEventType;
  source: TimelineEventSource;
  title: string;
  description?: string;
  eventDate: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApplicationInterview {
  type?: string | null;
  scheduledAt?: string | null;
  interviewer?: string | null;
  meetingUrl?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface ApplicationAI {
  summary: string;
  currentSituation: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
}

export interface ActionSummary {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  completed: number;
  highPriorityOpen: number;
}

export interface PreparationSummary {
  totalChecklistItems: number;
  completedChecklistItems: number;
  completionPercent: number;
}

export interface ApplicationDetail {
  application: Application;
  timeline: { count: number; latest: TimelineEvent | null };
  emails: CareerEmailRef[];
  jobMatch: Record<string, unknown> | null;
  interview: ApplicationInterview | null;
  aiSummary: { [key: string]: unknown } | null;
  preparation?: import("./interviewPreparation").InterviewPreparation | null;
  followUps?: import("./followUp").ApplicationFollowUp[];
  actionSummary?: ActionSummary;
  preparationSummary?: PreparationSummary;
}

export interface CareerEmailRef {
  id?: string;
  gmailMessageId?: string;
  subject?: string;
  from?: string;
  receivedAt?: string;
  category?: string;
  confidence?: number;
  summary?: string;
  companyName?: string;
  jobTitle?: string;
  suggestedApplicationStatus?: string;
}

export interface TimelineResponse {
  application: string;
  events: TimelineEvent[];
  pagination: ApplicationPagination;
}

export type ApplyCapability = "external_url" | "supported_api" | "manual_required";

export interface CapabilityInfo {
  capability: ApplyCapability;
  label: string;
  handoffUrl: string | null;
  canApplyInline?: boolean;
}

export interface ExecutionInfo {
  application: {
    id: string;
    job: string;
    status: string;
    appliedAt?: string | null;
    notes?: string | null;
    updatedAt?: string;
  };
  job: {
    id?: string;
    title?: string;
    companyName?: string;
    location?: string | null;
    locations?: string[];
    remoteType?: string;
    employmentType?: string;
    source?: string;
    sourceJobId?: string | null;
    jobUrl?: string | null;
    applyUrl?: string | null;
    applyCapability?: ApplyCapability | null;
  };
  capabilityInfo: CapabilityInfo & { statusUnchanged?: boolean };
}

export type JobFitOverall = "strong" | "moderate" | "weak" | "uncertain";

export interface JobFitAssistResult {
  assessment: {
    overallFit: JobFitOverall;
    summary: string;
    highlights: string[];
    gaps: string[];
    uncertainties: string[];
    suggestedQuestionsToAskEmployer: string[];
  };
  advisoryOnly: true;
  statusUnchanged: true;
}
