import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";
import {
  AttentionItem,
  CareerIntelligence,
  NextAction,
  RecentActivityItem,
  RecentCareerEmail,
  UpcomingInterview,
} from "../types/dashboard";
import { ApplicationStatus } from "../types/application";

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
  const cards: { label: string; value: number; status?: ApplicationStatus }[] = [
    { label: "Total", value: overview?.totalApplications ?? 0 },
    { label: "Saved", value: overview?.saved ?? 0, status: "saved" },
    { label: "Applied", value: overview?.applied ?? 0, status: "applied" },
    { label: "Screening", value: overview?.screening ?? 0, status: "screening" },
    { label: "Interview", value: overview?.interview ?? 0, status: "interview" },
    { label: "Offer", value: overview?.offer ?? 0, status: "offer" },
    { label: "Rejected", value: overview?.rejected ?? 0, status: "rejected" },
    { label: "Withdrawn", value: overview?.withdrawn ?? 0, status: "withdrawn" },
  ];

  return (
    <DashboardLayout active="Dashboard">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Career Intelligence
            </h1>
            <p className="text-slate-500 mt-1">
              Turn your applications, emails, timeline and interviews into a
              clear action center
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Building your dashboard...</p>
          </div>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Pipeline Overview
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-4">
                {cards.map((card) => (
                  <button
                    key={card.label}
                    onClick={() => goApplications(card.status)}
                    disabled={!card.status}
                    className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all disabled:hover:border-slate-200 disabled:hover:shadow-none text-center"
                  >
                    <p className="text-3xl font-bold text-slate-900">
                      {card.value}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">{card.label}</p>
                  </button>
                ))}
              </div>
              {data?.generatedAt && (
                <p className="text-xs text-slate-400 mt-3">
                  Updated {formatDateTime(data.generatedAt)}
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <section className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Needs Attention
                </h2>
                {!data || data.attention.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Nothing needs immediate attention.
                  </p>
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

              <section className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Upcoming Interviews
                </h2>
                {!data || data.upcomingInterviews.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No upcoming interviews scheduled.
                  </p>
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
              <section className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Next Actions
                </h2>
                {!data || data.nextActions.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No recommended actions right now.
                  </p>
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

              <section className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Recent Career Emails
                </h2>
                {!data || data.recentCareerEmails.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No career emails synced yet.
                  </p>
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

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Recent Activity
              </h2>
              {!data || data.recentActivity.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No recent activity recorded.
                </p>
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

function AttentionRow({
  item,
  onOpen,
}: {
  item: AttentionItem;
  onOpen: () => void;
}) {
  return (
    <li className="border border-slate-200 rounded-lg p-3">
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
          className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full border ${ACTION_STYLES[item.priority] || ACTION_STYLES.low}`}
        >
          {item.priority}
        </span>
      </div>
      <div className="mt-3">
        <button
          onClick={onOpen}
          className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
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
    <li className="border border-purple-200 bg-purple-50/40 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {companyLabel(item.application)} · {jobLabel(item.application)}
          </p>
          <p className="text-sm text-slate-700 mt-1 font-medium">
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
          className="shrink-0 px-3 py-1.5 text-xs text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
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
    <li className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{action.action}</p>
          <p className="text-xs text-slate-700 mt-1">{action.reason}</p>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {jobLabel(action.application)} · {companyLabel(action.application)}
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full border ${ACTION_STYLES[action.priority] || ACTION_STYLES.low}`}
        >
          {action.priority}
        </span>
      </div>
      <div className="mt-3">
        <button
          onClick={onOpen}
          className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
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
    <li className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {item.email.subject || "(no subject)"}
          </p>
          <p className="text-xs text-slate-500 truncate">{item.email.from || ""}</p>
        </div>
        {item.email.category && (
          <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">
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
      <div className="mt-3">
        <button
          onClick={onOpen}
          className="px-3 py-1.5 text-xs text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          View Email
        </button>
      </div>
    </li>
  );
}

function ActivityRow({ item }: { item: RecentActivityItem }) {
  return (
    <li className="py-3 flex items-start gap-3">
      <span
        className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full ${
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
        <p className="text-sm text-slate-900">{item.title}</p>
        {item.description && (
          <p className="text-xs text-slate-500">{item.description}</p>
        )}
        {item.application && item.application._id && (
          <p className="text-xs text-slate-400 mt-0.5">
            {jobLabel(item.application)} · {companyLabel(item.application)}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-slate-400">
        {formatDateTime(item.date)}
      </span>
    </li>
  );
}

export default Dashboard;
