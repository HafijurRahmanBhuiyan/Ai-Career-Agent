import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";
import {
  ApplicationAnalytics,
  AnalyticsRange,
  AnalyticsApplicationRef,
  TrendMetric,
} from "../types/analytics";

const API_BASE = "";
const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "365d", label: "365 days" },
  { value: "all", label: "All time" },
];

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_BADGES: Record<string, string> = {
  saved: "bg-slate-100 text-slate-700",
  applied: "bg-blue-50 text-blue-700",
  screening: "bg-cyan-50 text-cyan-700",
  interview: "bg-purple-50 text-purple-700",
  offer: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-amber-50 text-amber-700",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function applicationLabel(app: AnalyticsApplicationRef | null): string {
  if (!app) return "Application";
  if (app.title) {
    return app.companyName ? `${app.title} · ${app.companyName}` : app.title;
  }
  return app.companyName || "Application";
}

function KpiCard({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`stat-card text-center ${
        onClick ? "cursor-pointer card-hover" : ""
      }`}
      onClick={onClick}
    >
      <p className="text-3xl font-bold tracking-tight text-gradient">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
      {sub && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mt-0.5">
          {sub}
        </p>
      )}
    </div>
  );
}

function TrendChart({ metric, label }: { metric: TrendMetric; label: string }) {
  const max = Math.max(1, ...metric.points.map((p) => p.value));
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <span className="badge bg-slate-100 text-slate-500">
          {metric.totalInRange} total
        </span>
      </div>
      {metric.points.length === 0 ? (
        <p className="text-xs text-slate-400">No data in this range.</p>
      ) : (
        <div className="flex items-end gap-1 h-28 rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-2">
          {metric.points.map((point, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-slate-500">
                {point.value > 0 ? point.value : ""}
              </span>
              <div
                className="w-full bg-gradient-to-t from-brand-600 to-violet-400 rounded-t"
                style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }}
                title={`${point.label}: ${point.value}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
        <span>{metric.points[0]?.label ?? ""}</span>
        <span>{metric.points[metric.points.length - 1]?.label ?? ""}</span>
      </div>
    </div>
  );
}

function Analytics() {
  const navigate = useNavigate();
  const [range, setRange] = useState<AnalyticsRange>("all");
  const [data, setData] = useState<ApplicationAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: AnalyticsRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApplicationAnalytics>(
        `${API_BASE}/applications/analytics?range=${r}`
      );
      setData(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load analytics"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const changeRange = (r: AnalyticsRange) => {
    setRange(r);
  };

  const goApplication = (app: AnalyticsApplicationRef | null) => {
    if (app?._id) {
      navigate(`/dashboard/applications?id=${app._id}`);
    }
  };

  if (loading && !data) {
    return (
      <DashboardLayout active="Analytics">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="spinner h-9 w-9 mb-4"></div>
            <p className="text-sm font-medium text-slate-500">Crunching your career stats...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const s = data?.summary;
  const hasData = (s?.totalApplications ?? 0) > 0;

  return (
    <DashboardLayout active="Analytics">
      <div className="max-w-7xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">
                Career Analytics
              </span>
            </h1>
            <p className="page-subtitle">
              A deterministic, read-only view of your job search performance.
            </p>
          </div>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="shrink-0 text-red-500 hover:text-red-700 ml-4 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="card mb-8 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Time range
            </label>
            <span className="text-xs text-slate-400">
              {RANGES.find((r) => r.value === range)?.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => changeRange(r.value)}
                className={`px-3.5 py-1.5 text-sm rounded-full border transition-all ${
                  range === r.value
                    ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white border-transparent font-medium shadow-glow-primary"
                    : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {!hasData ? (
          <div className="empty-state">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-violet-50">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7 text-brand-600"
              >
                <path d="M3 3v18h18" />
                <path d="M18 17V9M13 17V5M8 17v-3" />
              </svg>
            </div>
            <p className="mb-1 font-medium text-slate-700">
              No applications tracked yet.
            </p>
            <p className="mx-auto mb-6 max-w-md text-sm text-slate-400">
              Career analytics will appear here once you start tracking
              applications.
            </p>
            <button
              onClick={() => navigate("/dashboard/applications")}
              className="btn-primary"
            >
              View My Applications
            </button>
          </div>
        ) : (
          <>
            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Overview
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <KpiCard label="Total Applications" value={s?.totalApplications ?? 0} />
                <KpiCard label="Active" value={s?.activeApplications ?? 0} />
                <KpiCard label="Interviews" value={s?.totalInterviews ?? 0} />
                <KpiCard label="Offers" value={s?.totalOffers ?? 0} />
                <KpiCard label="Rejections" value={s?.totalRejections ?? 0} />
                <KpiCard
                  label="Stale"
                  value={s?.staleApplications ?? 0}
                  sub="active apps"
                />
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Application Funnel
                </h2>
              </div>
              <div className="card p-5 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {data?.funnel.stages.map((stage) => (
                    <div
                      key={stage.key}
                      className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/60 to-white p-4"
                    >
                      <div className="mb-3 h-1.5 w-8 rounded-full bg-gradient-to-r from-brand-400 to-violet-500"></div>
                      <p className="text-sm font-medium text-slate-500">{stage.label}</p>
                      <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                        {stage.count}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatPercent(stage.percentage)} of applications
                      </p>
                      {stage.dropOff > 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          {stage.dropOff} dropped from previous stage
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Funnel counts reflect current application status; rejected /
                  withdrawn applications are reported separately below and lower
                  the funnel conservatively.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip bg-red-50 text-red-700">Rejected: {data?.funnel.rejections}</span>
                  <span className="chip bg-amber-50 text-amber-700">Withdrawn: {data?.funnel.withdrawals}</span>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Conversion Metrics
                </h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Application → Interview", rate: data?.conversionMetrics.applicationToInterviewRate },
                  { label: "Interview → Offer", rate: data?.conversionMetrics.interviewToOfferRate },
                  { label: "Application → Offer", rate: data?.conversionMetrics.applicationToOfferRate },
                  { label: "Rejection Rate", rate: data?.conversionMetrics.rejectionRate },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white p-5 text-center"
                  >
                    <p className="text-3xl font-bold tracking-tight text-gradient">
                      {formatPercent(m.rate ?? 0)}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Rates are computed from current application status and never
                divide by zero. Rejected/withdrawn applications lower rates
                conservatively.
              </p>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Trends
                </h2>
              </div>
              <div className="card p-5 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <TrendChart metric={data?.trends.applicationsApplied ?? emptyMetric()} label="Applications Applied" />
                  <TrendChart metric={data?.trends.interviews ?? emptyMetric()} label="Interviews" />
                  <TrendChart metric={data?.trends.offers ?? emptyMetric()} label="Offers" />
                  <TrendChart metric={data?.trends.rejections ?? emptyMetric()} label="Rejections" />
                </div>
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Pipeline by Status
                </h2>
              </div>
              <div className="card p-5 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
                  {Object.entries(data?.applicationsByStatus ?? {}).map(
                    ([status, count]) => (
                      <div
                        key={status}
                        className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center"
                      >
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                            STATUS_BADGES[status] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                        <p className="text-xl font-bold tabular-nums text-slate-900 mt-2">
                          {count}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Follow-up Performance
                </h2>
              </div>
              <div className="card p-5 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <KpiCard label="Open" value={data?.followUps.open ?? 0} />
                  <KpiCard label="Completed" value={data?.followUps.completed ?? 0} />
                  <KpiCard label="Overdue" value={data?.followUps.overdue ?? 0} />
                  <KpiCard label="Due Today" value={data?.followUps.dueToday ?? 0} />
                  <KpiCard label="High Priority Open" value={data?.followUps.highPriorityOpen ?? 0} />
                  <KpiCard label="Completion Rate" value={formatPercent(data?.followUps.completionRate ?? 0)} />
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Descriptive only — no causal claims are made between follow-ups
                  and outcomes. {data?.followUps.appsWithFollowUps ?? 0} application(s) have
                  follow-ups; {data?.followUps.appsWithOverdueFollowUps ?? 0} have overdue ones.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Interview Preparation
                </h2>
              </div>
              <div className="card p-5 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <KpiCard label="With Prep" value={data?.preparation.appsWithPreparation ?? 0} />
                  <KpiCard label="Without Prep" value={data?.preparation.appsWithoutPreparation ?? 0} />
                  <KpiCard label="Fully Prepared" value={data?.preparation.fullyPrepared ?? 0} />
                  <KpiCard label="Partially Prepared" value={data?.preparation.partiallyPrepared ?? 0} />
                  <KpiCard
                    label="Avg Prep Completion"
                    value={`${data?.preparation.averageCompletionPercent ?? 0}%`}
                  />
                </div>
                {data && data.preparation.upcomingInterviewsWithIncompletePreparation > 0 && (
                  <p className="mt-4 text-xs font-medium text-amber-600">
                    {data.preparation.upcomingInterviewsWithIncompletePreparation}{" "}
                    upcoming interview(s) have incomplete preparation.
                  </p>
                )}
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Company Insights
                </h2>
              </div>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Company</th>
                      <th className="th">Apps</th>
                      <th className="th">Interviews</th>
                      <th className="th">Offers</th>
                      <th className="th">Rejections</th>
                      <th className="th">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data?.companies.map((c) => (
                      <tr key={c.company} className="transition-colors hover:bg-brand-50/40">
                        <td className="td font-medium text-slate-900">{c.company}</td>
                        <td className="td">{c.applications}</td>
                        <td className="td">{c.interviews}</td>
                        <td className="px-4 py-3.5 text-emerald-600">{c.offers}</td>
                        <td className="px-4 py-3.5 text-red-600">{c.rejections}</td>
                        <td className="td">{c.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2.5">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-violet-600"></span>
                <h2 className="text-base font-semibold text-slate-900">
                  Attention Items
                </h2>
              </div>
              {!data || data.attentionItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
                  No analytics-based action items right now.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.attentionItems.map((item, idx) => (
                    <li
                      key={`${item.type}-${idx}`}
                      className="card flex items-start justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`badge ${
                              PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.low
                            }`}
                          >
                            {item.priority}
                          </span>
                          <p className="font-medium text-slate-900 text-sm">
                            {item.title}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {applicationLabel(item.application)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.reason}
                        </p>
                      </div>
                      <button
                        onClick={() => goApplication(item.application)}
                        disabled={!item.application}
                        className="btn-outline btn-sm shrink-0 whitespace-nowrap"
                      >
                        View Application
                      </button>
                    </li>
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

function emptyMetric(): TrendMetric {
  return { points: [], totalInRange: 0 };
}

export default Analytics;
