import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";
import {
  AttentionItem,
  CareerIntelligence,
  DashboardFollowUp,
  NextAction,
  RecentActivityItem,
  RecentCareerEmail,
  UpcomingInterview,
} from "../types/dashboard";
import { ApplicationStatus } from "../types/application";
import { FOLLOW_UP_ACTION_LABELS } from "../types/followUp";

const API_BASE = "/dashboard";

const STATUS_BADGES: Record<ApplicationStatus, string> = {
  saved: "bg-slate-100 text-slate-700",
  applied: "bg-blue-50 text-blue-700",
  screening: "bg-cyan-50 text-cyan-700",
  interview: "bg-purple-50 text-purple-700",
  offer: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-amber-50 text-amber-700",
};

const ACTION_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const ACTIVITY_KIND_STYLES: Record<string, string> = {
  event: "bg-blue-50 text-blue-700",
  email: "bg-purple-50 text-purple-700",
  status_change: "bg-emerald-50 text-emerald-700",
};

const PIPELINE_META: {
  label: string;
  status?: ApplicationStatus;
  accent: string;
  tint: string;
}[] = [
  { label: "Total", accent: "text-slate-900", tint: "from-slate-400 to-slate-600" },
  { label: "Saved", status: "saved", accent: "text-slate-600", tint: "from-slate-300 to-slate-400" },
  { label: "Applied", status: "applied", accent: "text-blue-600", tint: "from-blue-400 to-blue-600" },
  { label: "Screening", status: "screening", accent: "text-cyan-600", tint: "from-cyan-400 to-cyan-600" },
  { label: "Interview", status: "interview", accent: "text-violet-600", tint: "from-violet-400 to-violet-600" },
  { label: "Offer", status: "offer", accent: "text-emerald-600", tint: "from-emerald-400 to-emerald-600" },
  { label: "Rejected", status: "rejected", accent: "text-red-500", tint: "from-red-400 to-red-500" },
  { label: "Withdrawn", status: "withdrawn", accent: "text-amber-600", tint: "from-amber-400 to-amber-600" },
];

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function jobLabel(app: { job?: { title?: string; companyName?: string } | null }): string {
  return app.job?.title || "Untitled Job";
}

function companyLabel(app: { job?: { companyName?: string } | null }): string {
  return app.job?.companyName || "Unknown company";
}

function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<CareerIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CareerIntelligence>(
        `${API_BASE}/career-intelligence`
      );
      setData(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load career intelligence"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goApplications = (status?: ApplicationStatus) => {
    navigate(status ? `/dashboard/applications?status=${status}` : "/dashboard/applications");
  };

  const goEmails = (category?: string) => {
    navigate(category ? `/dashboard/emails?category=${category}` : "/dashboard/emails");
  };

  const overview = data?.overview;
  const cards = PIPELINE_META.map((meta) => ({
    ...meta,
    value: !meta.status
      ? (overview?.totalApplications ?? 0)
      : overview?.[meta.status] ?? 0,
  }));

  return (
    <DashboardLayout active="Dashboard">
      <div className="max-w-7xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">Career Intelligence</h1>
            <p className="page-subtitle">
              Turn your applications, emails, timeline and interviews into a
              clear action center
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="btn-outline btn-sm shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-4 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className="text-center py-24">
            <div className="spinner h-9 w-9 mb-4"></div>
            <p className="text-slate-500 text-sm">Building your dashboard…</p>
          </div>
        ) : (
          <>
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Pipeline Overview</h2>
                {data?.generatedAt && (
                  <span className="text-xs text-slate-400">
                    Updated {formatDateTime(data.generatedAt)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
                {cards.map((card) => (
                  <button
                    key={card.label}
                    onClick={() => goApplications(card.status)}
                    disabled={!card.status}
                    className="card p-4 text-left hover:shadow-card-hover hover:border-slate-300 transition-all disabled:hover:shadow-card disabled:hover:border-slate-200/80 group"
                  >
                    <div
                      className={`w-7 h-1.5 rounded-full bg-gradient-to-r ${card.tint} mb-3 opacity-70 group-hover:opacity-100 transition-opacity`}
                    />
                    <p className={`text-3xl font-bold tracking-tight ${card.accent}`}>
                      {card.value}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">{card.label}</p>
                  </button>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <section className="card p-6">
                <SectionHeading
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="M22 4 12 14l-3-3" />
                    </svg>
                  }
                  accent="bg-amber-50 text-amber-600"
                  title="Needs Attention"
                />
                {!data || data.attention.length === 0 ? (
                  <EmptyState text="Nothing needs immediate attention." />
                ) : (
                  <ul className="space-y-3">
                    {data.attention.map((item, idx) => (
                      <AttentionRow
                        key={`${item.application._id}-${idx}`}
                        item={item}
                        onOpen={() =>
                          navigate(`/dashboard/applications?status=${item.application.status}`)
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-6">
                <SectionHeading
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  }
                  accent="bg-violet-50 text-violet-600"
                  title="Upcoming Interviews"
                />
                {!data || data.upcomingInterviews.length === 0 ? (
                  <EmptyState text="No upcoming interviews scheduled." />
                ) : (
                  <ul className="space-y-3">
                    {data.upcomingInterviews.map((item) => (
                      <UpcomingInterviewRow
                        key={item.application._id}
                        item={item}
                        onOpen={() =>
                          navigate(`/dashboard/applications?status=${item.application.status}`)
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <section className="card p-6">
                <SectionHeading
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="m22 7-8.5 8.5-5-5L2 17" />
                      <path d="M16 7h6v6" />
                    </svg>
                  }
                  accent="bg-emerald-50 text-emerald-600"
                  title="Next Actions"
                />
                {!data || data.nextActions.length === 0 ? (
                  <EmptyState text="No recommended actions right now." />
                ) : (
                  <ul className="space-y-3">
                    {data.nextActions.map((action, idx) => (
                      <NextActionRow
                        key={`${action.application._id}-${idx}`}
                        action={action}
                        onOpen={() =>
                          navigate(`/dashboard/applications?status=${action.application.status}`)
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-6">
                <SectionHeading
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-10 6L2 7" />
                    </svg>
                  }
                  accent="bg-blue-50 text-blue-600"
                  title="Recent Career Emails"
                />
                {!data || data.recentCareerEmails.length === 0 ? (
                  <EmptyState text="No career emails synced yet." />
                ) : (
                  <ul className="space-y-3">
                    {data.recentCareerEmails.map((item, idx) => (
                      <EmailRow
                        key={`${item.email.id}-${idx}`}
                        item={item}
                        onOpen={() => goEmails(item.email.category)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="card p-6 mb-8">
              <SectionHeading
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                }
                accent="bg-cyan-50 text-cyan-600"
                title="Follow-ups"
                action={
                  data && data.followUps && data.followUps.length > 0 ? (
                    <button
                      onClick={() => navigate("/dashboard/follow-ups")}
                      className="btn-secondary btn-sm"
                    >
                      View all
                    </button>
                  ) : undefined
                }
              />
              {!data || !data.followUps || data.followUps.length === 0 ? (
                <EmptyState text="No follow-ups to show right now." />
              ) : (
                <ul className="space-y-3">
                  {data.followUps
                    .filter((f) => !f.completed)
                    .slice(0, 8)
                    .map((item) => (
                      <FollowUpRow
                        key={item.id}
                        item={item}
                        onOpen={() =>
                          navigate(`/dashboard/applications?id=${item.application?._id}`)
                        }
                      />
                    ))}
                </ul>
              )}
            </section>

            <section className="card p-6 mb-8">
              <SectionHeading
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9M13 17V5M8 17v-3" />
                  </svg>
                }
                accent="bg-brand-50 text-brand-600"
                title="Career Performance"
                action={
                  <button
                    onClick={() => navigate("/dashboard/analytics")}
                    className="btn-secondary btn-sm"
                  >
                    View Analytics
                  </button>
                }
              />
              {!data ? (
                <EmptyState text="No performance data yet." />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <PerformanceStat
                    label="App → Interview"
                    value={`${Math.round(
                      (data.overview.interview + data.overview.offer) /
                        Math.max(1, data.overview.totalApplications) *
                        100
                    )}%`}
                  />
                  <PerformanceStat
                    label="Interview → Offer"
                    value={`${Math.round(
                      data.overview.offer /
                        Math.max(1, data.overview.interview + data.overview.offer) *
                        100
                    )}%`}
                  />
                  <PerformanceStat
                    label="Active"
                    value={data.overview.screening + data.overview.interview}
                  />
                  <PerformanceStat label="Offers" value={data.overview.offer} />
                </div>
              )}
            </section>

            <section className="card p-6">
              <SectionHeading
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                  </svg>
                }
                accent="bg-sky-50 text-sky-600"
                title="Recent Activity"
              />
              {!data || data.recentActivity.length === 0 ? (
                <EmptyState text="No recent activity recorded." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentActivity.map((item, idx) => (
                    <ActivityRow key={`${item.id}-${idx}`} item={item} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function SectionHeading({
  icon,
  accent,
  title,
  action,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          {icon}
        </span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

function AttentionRow({
  item,
  onOpen,
}: {
  item: AttentionItem;
  onOpen: () => void;
}) {
  return (
    <li className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {jobLabel(item.application)}
          </p>
          <p className="text-xs text-slate-500">{companyLabel(item.application)}</p>
          <p className="text-xs text-slate-700 mt-2">{item.reason}</p>
          {item.eventDate && (
            <p className="text-xs text-slate-400 mt-1">
              Relevant date: {formatDate(item.eventDate)}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 badge border ${ACTION_STYLES[item.priority] || ACTION_STYLES.low}`}
        >
          {item.priority}
        </span>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onOpen} className="btn-primary btn-sm">
          View Application
        </button>
      </div>
    </li>
  );
}

function UpcomingInterviewRow({
  item,
  onOpen,
}: {
  item: UpcomingInterview;
  onOpen: () => void;
}) {
  return (
    <li className="border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {companyLabel(item.application)} · {jobLabel(item.application)}
          </p>
          <p className="text-sm text-violet-700 mt-1 font-semibold">
            {formatDateTime(item.interview.scheduledAt)}
          </p>
          {item.interview.interviewer && (
            <p className="text-xs text-slate-600 mt-1">
              Interviewer: {item.interview.interviewer}
            </p>
          )}
          {item.interview.location && (
            <p className="text-xs text-slate-600 mt-0.5">
              Location: {item.interview.location}
            </p>
          )}
          {item.interview.meetingUrl && (
            <a
              href={item.interview.meetingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block break-all"
            >
              Open meeting link
            </a>
          )}
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 btn-outline btn-sm"
        >
          Open Application
        </button>
      </div>
    </li>
  );
}

function NextActionRow({
  action,
  onOpen,
}: {
  action: NextAction;
  onOpen: () => void;
}) {
  return (
    <li className="border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{action.action}</p>
          <p className="text-xs text-slate-700 mt-1">{action.reason}</p>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {jobLabel(action.application)} · {companyLabel(action.application)}
          </p>
        </div>
        <span
          className={`shrink-0 badge border ${ACTION_STYLES[action.priority] || ACTION_STYLES.low}`}
        >
          {action.priority}
        </span>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onOpen} className="btn-secondary btn-sm">
          View Application
        </button>
      </div>
    </li>
  );
}

function EmailRow({
  item,
  onOpen,
}: {
  item: RecentCareerEmail;
  onOpen: () => void;
}) {
  return (
    <li className="border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {item.email.subject || "(no subject)"}
          </p>
          <p className="text-xs text-slate-500 truncate">{item.email.from || ""}</p>
        </div>
        {item.email.category && (
          <span className="shrink-0 badge bg-slate-100 text-slate-600">
            {item.email.category}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>{formatDate(item.email.receivedAt ?? undefined)}</span>
        {item.application && (
          <span>
            Matched: {jobLabel(item.application)} ·{" "}
            <span
              className={`px-1.5 py-0.5 rounded-full ${
                STATUS_BADGES[item.application!.status] || "bg-slate-100 text-slate-600"
              }`}
            >
              {item.application.status}
            </span>
          </span>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onOpen} className="btn-outline btn-sm">
          View Email
        </button>
      </div>
    </li>
  );
}

const FOLLOW_UP_URGENCY_STYLES: Record<string, string> = {
  overdue: "bg-red-50 text-red-700",
  due_today: "bg-amber-50 text-amber-700",
  upcoming: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
};

const FOLLOW_UP_PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

function PerformanceStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/80 p-5 text-center">
      <p className="text-3xl font-bold tracking-tight text-gradient">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function FollowUpRow({
  item,
  onOpen,
}: {
  item: DashboardFollowUp;
  onOpen: () => void;
}) {
  return (
    <li className="border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">
              {FOLLOW_UP_ACTION_LABELS[item.action as keyof typeof FOLLOW_UP_ACTION_LABELS] || item.action}
            </p>
            <span
              className={`badge ${
                FOLLOW_UP_URGENCY_STYLES[item.urgency] || FOLLOW_UP_URGENCY_STYLES.upcoming
              }`}
            >
              {item.urgency.replace("_", " ")}
            </span>
            <span
              className={`badge ${
                FOLLOW_UP_PRIORITY_STYLES[item.priority] || FOLLOW_UP_PRIORITY_STYLES.medium
              }`}
            >
              {item.priority}
            </span>
          </div>
          {item.note && (
            <p className="text-xs text-slate-700 mt-1 truncate">{item.note}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            Due {formatDate(item.dueAt)} ·{" "}
            {item.application ? `${companyLabel(item.application)} · ${jobLabel(item.application)}` : "Application"}
          </p>
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 btn-secondary btn-sm"
        >
          View Application
        </button>
      </div>
    </li>
  );
}

function ActivityRow({ item }: { item: RecentActivityItem }) {
  return (
    <li className="py-3.5 flex items-start gap-3">
      <span
        className={`shrink-0 badge ${
          ACTIVITY_KIND_STYLES[item.kind] || "bg-slate-100 text-slate-600"
        }`}
      >
        {item.kind === "event"
          ? item.type || "event"
          : item.kind === "email"
          ? "email"
          : "status"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-900 font-medium">{item.title}</p>
        {item.description && (
          <p className="text-xs text-slate-500">{item.description}</p>
        )}
        {item.application && item.application._id && (
          <p className="text-xs text-slate-400 mt-0.5">
            {jobLabel(item.application)} · {companyLabel(item.application)}
          </p>
        )}
        <p className="text-xs text-slate-400 mt-1 sm:hidden">
          {formatDateTime(item.date)}
        </p>
      </div>
      <span className="hidden sm:block shrink-0 text-xs text-slate-400">
        {formatDateTime(item.date)}
      </span>
    </li>
  );
}

export default Dashboard;