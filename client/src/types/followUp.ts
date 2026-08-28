export const FOLLOW_UP_ACTIONS = [
  "recruiter_follow_up",
  "interview_follow_up",
  "application_follow_up",
  "thank_you_note",
  "custom",
] as const;

export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];

export const FOLLOW_UP_PRIORITIES = ["low", "medium", "high"] as const;

export type FollowUpPriority = (typeof FOLLOW_UP_PRIORITIES)[number];

export interface ApplicationFollowUp {
  id: string;
  application?: string;
  action: FollowUpAction;
  note?: string | null;
  dueAt: string;
  priority: FollowUpPriority;
  completed: boolean;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FollowUpListResponse {
  followUps: ApplicationFollowUp[];
  pagination: {
    page?: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type FollowUpUrgency =
  | "overdue"
  | "due_today"
  | "upcoming"
  | "completed"
  | "inactive";

export interface GlobalFollowUp {
  id: string;
  action: FollowUpAction;
  note?: string | null;
  dueAt: string;
  priority: FollowUpPriority;
  completed: boolean;
  completedAt?: string | null;
  application: {
    _id: string;
    status: string;
    job?: {
      title?: string;
      companyName?: string;
    } | null;
  };
}

export interface GlobalFollowUpListResponse {
  followUps: GlobalFollowUp[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FollowUpSuggestion {
  action: FollowUpAction;
  note?: string | null;
  dueDate?: string | null;
  priority: FollowUpPriority;
  reason: string;
}

export const FOLLOW_UP_PRIORITIES_LABELS: Record<FollowUpPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const FOLLOW_UP_ACTION_LABELS: Record<FollowUpAction, string> = {
  recruiter_follow_up: "Recruiter follow-up",
  interview_follow_up: "Interview follow-up",
  application_follow_up: "Application follow-up",
  thank_you_note: "Thank-you note",
  custom: "Custom",
};

export function formatDueUrgency(
  dueAt: string,
  completed: boolean,
  applicationStatus?: string | null
): string {
  if (completed) return "Completed";
  if (
    applicationStatus === "rejected" ||
    applicationStatus === "withdrawn"
  ) {
    return "Inactive";
  }
  const now = new Date();
  const due = new Date(dueAt);
  if (due.getTime() < now.getTime()) return "Overdue";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  if (due.getTime() >= todayStart.getTime() && due.getTime() < todayEnd.getTime()) {
    return "Due today";
  }
  return "Upcoming";
}
