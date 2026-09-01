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
  jobUrl?: string | null;
  applyUrl?: string | null;
  applyCapability?: ApplyCapability | null;
}

export interface CareerEmailDetection {
  id: string;
  careerStatus: string;
  careerStatusConfidence: number | null;
  careerStatusDetectedAt: string | null;
  autoStatusApplied: boolean;
  autoStatusReason: string | null;
  manualStatusApplied: boolean;
  manualStatusAppliedAt: string | null;
  manualStatusReason: string | null;
}

export interface LatestStatusEvent {
  id: string;
  title: string;
  eventDate: string;
  source: string;
}

export type LatestCareerEventType =
  | "interview"
  | "screening"
  | "assessment"
  | "shortlist"
  | "offer"
  | "rejection"
  | "recruiter_contact"
  | "application_update";

export interface LatestCareerEvent {
  type?: LatestCareerEventType;
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

export interface Application {
  _id: string;
  job?: ApplicationJob;
  status: ApplicationStatus;
  appliedAt?: string | null;
  notes?: string | null;
  careerEmailDetection?: CareerEmailDetection | null;
  latestCareerEvent?: LatestCareerEvent | null;
  latestStatusEvent?: LatestStatusEvent | null;
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
  careerStatus?: string | null;
  careerStatusConfidence?: number | null;
  careerStatusDetectedAt?: string | null;
  autoStatusApplied?: boolean;
  autoStatusReason?: string | null;
  manualStatusApplied?: boolean;
  manualStatusAppliedAt?: string | null;
  manualStatusReason?: string | null;
  careerEvent?: LatestCareerEvent | null;
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
