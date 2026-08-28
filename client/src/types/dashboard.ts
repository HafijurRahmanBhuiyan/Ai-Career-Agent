import {
  ApplicationStatus,
  CareerEmailCategory,
} from "./careerEmail";
import { ApplicationJob } from "./application";

export interface DashboardOverview {
  totalApplications: number;
  saved: number;
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  rejected: number;
  withdrawn: number;
}

export interface DashboardApplicationRef {
  _id: string;
  status: ApplicationStatus;
  appliedAt?: string | null;
  updatedAt?: string | null;
  job?: ApplicationJob | null;
}

export interface AttentionItem {
  application: DashboardApplicationRef;
  reason: string;
  priority: "high" | "medium" | "low";
  eventDate?: string;
}

export interface UpcomingInterview {
  application: DashboardApplicationRef;
  interview: {
    scheduledAt: string;
    interviewer?: string | null;
    meetingUrl?: string | null;
    location?: string | null;
  };
  eventDate: string;
}

export interface RecentStatusChange {
  application: DashboardApplicationRef;
  event: {
    id: string;
    title: string;
    description?: string;
    eventDate: string;
    source: string;
  };
  previousStatus: string | null;
  newStatus: string;
}

export interface RecentCareerEmail {
  email: {
    id: string;
    subject?: string;
    from?: string;
    receivedAt?: string | null;
    category?: CareerEmailCategory;
    companyName?: string;
    jobTitle?: string;
    suggestedApplicationStatus?: ApplicationStatus | null;
  };
  application: DashboardApplicationRef | null;
}

export interface RecentActivityItem {
  id: string;
  kind: "event" | "email" | "status_change";
  date: string;
  title: string;
  description?: string;
  type?: string;
  source?: string;
  application?: DashboardApplicationRef | null;
}

export interface NextAction {
  application: DashboardApplicationRef;
  action: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export type FollowUpUrgency =
  | "overdue"
  | "due_today"
  | "upcoming"
  | "completed"
  | "inactive";

export interface PreparationInsight {
  application: DashboardApplicationRef;
  reason: string;
  priority: "high" | "medium" | "low";
  preparedCount: number;
  totalChecklistItems: number;
}

export interface DashboardFollowUp {
  id: string;
  action: string;
  note?: string | null;
  dueAt: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
  completedAt?: string | null;
  application: DashboardApplicationRef | null;
  urgency: FollowUpUrgency;
}

export interface CareerIntelligence {
  overview: DashboardOverview;
  attention: AttentionItem[];
  upcomingInterviews: UpcomingInterview[];
  recentStatusChanges: RecentStatusChange[];
  recentCareerEmails: RecentCareerEmail[];
  recentActivity: RecentActivityItem[];
  nextActions: NextAction[];
  preparationInsights?: PreparationInsight[];
  followUps?: DashboardFollowUp[];
  generatedAt: string;
}
