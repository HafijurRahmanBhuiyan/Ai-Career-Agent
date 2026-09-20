import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";
import {
  GlobalFollowUp,
  GlobalFollowUpListResponse,
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_PRIORITIES_LABELS,
  FollowUpPriority,
  formatDueUrgency,
} from "../types/followUp";

const API_BASE = "";
const PAGE_SIZE = 20;

const URGENCY_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "inactive", label: "Inactive" },
];

const PRIORITY_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_BADGES: Record<string, string> = {
  saved: "bg-slate-100 text-slate-700",
  applied: "bg-blue-50 text-blue-700",
  screening: "bg-cyan-50 text-cyan-700",
  interview: "bg-purple-50 text-purple-700",
  offer: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-amber-50 text-amber-700",
};

const URGENCY_STYLES: Record<string, string> = {
  Overdue: "bg-red-50 text-red-700",
  "Due today": "bg-amber-50 text-amber-700",
  Upcoming: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Inactive: "bg-slate-100 text-slate-500",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function FollowUps() {
  const navigate = useNavigate();
  const [followUps, setFollowUps] = useState<GlobalFollowUp[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [priority, setPriority] = useState<FollowUpPriority | "">("");
  const [completion, setCompletion] = useState<"" | "true" | "false">("");
  const [due, setDue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (priority) params.set("priority", priority);
    if (completion) params.set("completed", completion);
    if (due) params.set("due", due);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    return params.toString();
  }, [priority, completion, due, page]);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<GlobalFollowUpListResponse>(
        `${API_BASE}/applications/follow-ups?${buildQuery()}`
      );
      setFollowUps(res.data.followUps);
      setPagination(res.data.pagination);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load follow-ups"));
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const resetPage = () => setPage(1);

  return (
    <DashboardLayout active="Follow-ups">
      <div className="max-w-5xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">Follow-ups</h1>
            <p className="page-subtitle">
              Track every follow-up across all your applications
            </p>
          </div>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-700 hover:text-red-900 font-semibold shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full sm:w-auto">
              <label className="field-label">Date bucket</label>
              <select
                value={due}
                onChange={(e) => {
                  setDue(e.target.value);
                  resetPage();
                }}
                className="select w-full sm:w-44"
              >
                {URGENCY_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="field-label">Completed</label>
              <select
                value={completion}
                onChange={(e) => {
                  setCompletion(e.target.value as "" | "true" | "false");
                  resetPage();
                }}
                className="select w-full sm:w-44"
              >
                <option value="">All</option>
                <option value="false">Open</option>
                <option value="true">Completed</option>
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="field-label">Priority</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as FollowUpPriority | "");
                  resetPage();
                }}
                className="select w-full sm:w-44"
              >
                {PRIORITY_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => setPage(1)} className="btn-primary">
              Apply
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <span className="spinner h-8 w-8"></span>
            <p className="mt-4 text-sm text-slate-500">Loading follow-ups...</p>
          </div>
        ) : followUps.length === 0 ? (
          <div className="empty-state">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-glow-primary">
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700 mb-1">
              No follow-ups found.
            </p>
            <p className="text-xs text-slate-400">
              Add follow-ups from an application's detail view to track them
              here.
            </p>
          </div>
        ) : (
          <div className="table-wrap overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="th">Application</th>
                  <th className="th">Action</th>
                  <th className="th">Due</th>
                  <th className="th">Status</th>
                  <th className="th">App status</th>
                  <th className="th text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {followUps.map((f) => {
                  const appStatus = f.application?.status;
                  const urgency = formatDueUrgency(f.dueAt, f.completed, appStatus);
                  return (
                    <tr
                      key={f.id}
                      className="transition-colors hover:bg-brand-50/50"
                    >
                      <td className="px-4 py-4 align-middle">
                        <p className="font-medium text-slate-900">
                          {f.application?.job?.title || "Untitled Job"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {f.application?.job?.companyName || "Unknown company"}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <p className="font-medium text-slate-900">
                          {FOLLOW_UP_ACTION_LABELS[f.action]}
                        </p>
                        {f.note && (
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">
                            {f.note}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-middle text-xs text-slate-500">
                        {formatDate(f.dueAt)}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`badge ${
                              URGENCY_STYLES[urgency] || URGENCY_STYLES.Upcoming
                            }`}
                          >
                            {urgency}
                          </span>
                          <span
                            className={`badge ${
                              PRIORITY_STYLES[f.priority] || PRIORITY_STYLES.medium
                            }`}
                          >
                            {FOLLOW_UP_PRIORITIES_LABELS[f.priority]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        {appStatus && (
                          <span
                            className={`badge ${
                              STATUS_BADGES[appStatus] || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {appStatus}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right align-middle">
                        <button
                          onClick={() => navigate(`/dashboard/applications?id=${f.application?._id}`)}
                          className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 hover:border-brand-300 transition-colors shrink-0"
                        >
                          View Application
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn-outline btn-sm"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.totalPages || loading}
              className="btn-outline btn-sm"
            >
              Next
            </button>
          </div>
        )}

        {pagination.total > 0 && pagination.totalPages <= 1 && (
          <div className="mt-5 text-center text-xs text-slate-400">
            {pagination.total} follow-up(s)
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default FollowUps;
