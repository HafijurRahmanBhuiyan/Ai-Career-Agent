import { ApplicationStatus } from "./application";

export type AnalyticsRange = "7d" | "30d" | "90d" | "180d" | "365d" | "all";

export interface AnalyticsRangeMeta {
  value: AnalyticsRange;
  start: string | null;
  end: string;
  label: string;
}

export interface FunnelStage {
  key: "applications" | "screening" | "interview" | "offer";
  label: string;
  count: number;
  percentage: number;
  dropOff: number;
}

export interface FunnelShape {
  stages: FunnelStage[];
  rejections: number;
  withdrawals: number;
}

export interface ConversionMetrics {
  applicationToScreeningRate: number;
  screeningToInterviewRate: number;
  applicationToInterviewRate: number;
  interviewToOfferRate: number;
  applicationToOfferRate: number;
  rejectionRate: number;
}

export interface TimeToStageStats {
  sampleCount: number;
  averageDays: number | null;
  medianDays: number | null;
}

export interface TimeToStageMetrics {
  applicationToScreening: TimeToStageStats;
  screeningToInterview: TimeToStageStats;
  interviewToOffer: TimeToStageStats;
  applicationToOffer: TimeToStageStats;
  applicationToRejection: TimeToStageStats;
}

export interface TrendPoint {
  label: string;
  date: string;
  value: number;
}

export interface TrendMetric {
  points: TrendPoint[];
  totalInRange: number;
}

export interface TrendMetrics {
  applicationsCreated: TrendMetric;
  applicationsApplied: TrendMetric;
  interviews: TrendMetric;
  offers: TrendMetric;
  rejections: TrendMetric;
  withdrawals: TrendMetric;
  followUpsCreated: TrendMetric;
  followUpsCompleted: TrendMetric;
}

export interface FollowUpPerformance {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
  highPriorityOpen: number;
  completionRate: number;
  appsWithFollowUps: number;
  appsWithoutFollowUps: number;
  appsWithOverdueFollowUps: number;
}

export interface PreparationPerformance {
  appsWithPreparation: number;
  appsWithoutPreparation: number;
  averageCompletionPercent: number;
  fullyPrepared: number;
  partiallyPrepared: number;
  upcomingInterviewsWithIncompletePreparation: number;
}

export interface CompanyAnalytics {
  company: string;
  applications: number;
  interviews: number;
  offers: number;
  rejections: number;
  active: number;
}

export type AttentionPriority = "high" | "medium" | "low";

export type AttentionType =
  | "stale_active_application"
  | "overdue_high_priority_follow_up"
  | "upcoming_interview_incomplete_prep"
  | "interview_no_recent_activity"
  | "stuck_in_screening"
  | "stuck_in_interview";

export interface AnalyticsApplicationRef {
  _id: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  updatedAt: string | null;
  title: string | null;
  companyName: string | null;
}

export interface AttentionAnalyticsItem {
  type: AttentionType;
  priority: AttentionPriority;
  title: string;
  reason: string;
  application: AnalyticsApplicationRef | null;
  relevantDate: string | null;
}

export interface SummaryMetrics {
  totalApplications: number;
  activeApplications: number;
  completedApplications: number;
  totalInterviews: number;
  upcomingInterviews: number;
  completedInterviews: number;
  totalOffers: number;
  totalRejections: number;
  totalWithdrawals: number;
  staleApplications: number;
}

export interface ApplicationAnalytics {
  generatedAt: string;
  range: AnalyticsRangeMeta;
  limit: number;
  summary: SummaryMetrics;
  applicationsByStatus: Record<ApplicationStatus, number>;
  conversionMetrics: ConversionMetrics;
  funnel: FunnelShape;
  timeToStage: TimeToStageMetrics;
  trends: TrendMetrics;
  followUps: FollowUpPerformance;
  preparation: PreparationPerformance;
  companies: CompanyAnalytics[];
  attentionItems: AttentionAnalyticsItem[];
}
