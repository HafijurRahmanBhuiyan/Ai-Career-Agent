export type FollowUpUrgency =
  | "overdue"
  | "due_today"
  | "upcoming"
  | "completed"
  | "inactive";

export interface ClassifiableFollowUp {
  completed: boolean;
  dueAt: Date;
}

export interface ClassifiableApplication {
  status?: string;
}

const INACTIVE_STATUSES = new Set(["rejected", "withdrawn"]);

/**
 * Deterministic urgency classification for a single follow-up.
 *
 * OVERDUE:   not completed and due before now
 * DUE_TODAY: not completed and due within the current calendar day
 * UPCOMING:  not completed and due after the end of today
 * COMPLETED: completed === true
 * INACTIVE:  the owning application is rejected or withdrawn
 *
 * Inactive status is checked first so a rejected/withdrawn application's
 * follow-ups are never surfaced as urgent. An application that cannot be
 * resolved (e.g. deleted) is treated as inactive.
 */
export function classifyFollowUp(
  followUp: ClassifiableFollowUp,
  application: ClassifiableApplication | null | undefined
): FollowUpUrgency {
  if (followUp.completed) {
    return "completed";
  }
  if (
    !application ||
    (application.status != null && INACTIVE_STATUSES.has(application.status))
  ) {
    return "inactive";
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const due = followUp.dueAt.getTime();
  if (due < now.getTime()) {
    return "overdue";
  }
  if (due >= todayStart.getTime() && due < todayEnd.getTime()) {
    return "due_today";
  }
  return "upcoming";
}

type FollowUpPriority = "low" | "medium" | "high";

/**
 * Rankings used to sort follow-ups into a deterministic priority order:
 *   1. overdue high priority
 *   2. overdue medium/low
 *   3. due today
 *   4. upcoming high priority
 *   5. upcoming medium/low
 *   inactive, then completed last
 */
export function urgencyRank(
  urgency: FollowUpUrgency,
  priority: FollowUpPriority
): number {
  switch (urgency) {
    case "overdue":
      return priority === "high" ? 0 : 1;
    case "due_today":
      return 2;
    case "upcoming":
      return priority === "high" ? 3 : 4;
    case "inactive":
      return 5;
    case "completed":
      return 6;
  }
}

export interface FollowUpActionTotals {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  completed: number;
  highPriorityOpen: number;
}

/** Build per-application action counts from a set of classified follow-ups. */
export function buildFollowUpActionSummary(
  followUps: ClassifiableFollowUp[],
  application: ClassifiableApplication | null | undefined
): FollowUpActionTotals {
  let total = 0;
  let open = 0;
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  let completed = 0;
  let highPriorityOpen = 0;

  for (const followUp of followUps) {
    total++;
    const urgency = classifyFollowUp(followUp, application);
    if (urgency === "completed") {
      completed++;
      continue;
    }
    open++;
    const priority = (followUp as { priority?: FollowUpPriority }).priority;
    if (priority === "high") {
      highPriorityOpen++;
    }
    if (urgency === "overdue") {
      overdue++;
    } else if (urgency === "due_today") {
      dueToday++;
    } else if (urgency === "upcoming") {
      upcoming++;
    }
  }

  return {
    total,
    open,
    overdue,
    dueToday,
    upcoming,
    completed,
    highPriorityOpen,
  };
}

export interface PreparationTotals {
  totalChecklistItems: number;
  completedChecklistItems: number;
  completionPercent: number;
}

export interface PreparationLike {
  checklist?: Array<{ completed?: boolean }>;
}

/** Build a deterministic preparation summary from checklist data. */
export function buildPreparationSummary(
  preparation: PreparationLike | null | undefined
): PreparationTotals {
  const checklist = preparation?.checklist ?? [];
  const total = checklist.length;
  const completed = checklist.filter((item) => item.completed === true).length;
  const percent =
    total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    totalChecklistItems: total,
    completedChecklistItems: completed,
    completionPercent: percent,
  };
}
