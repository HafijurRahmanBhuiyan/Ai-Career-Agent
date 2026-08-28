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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Follow-ups</h1>
          <p className="text-slate-500 mt-1">
            Track every follow-up across all your applications
          </p>
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

        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Date bucket
              </label>
              <select
                value={due}
                onChange={(e) => {
                  setDue(e.target.value);
                  resetPage();
                }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {URGENCY_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Completed
              </label>
              <select
                value={completion}
                onChange={(e) => {
                  setCompletion(e.target.value as "" | "true" | "false");
                  resetPage();
                }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="false">Open</option>
                <option value="true">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as FollowUpPriority | "");
                  resetPage();
                }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITY_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setPage(1)}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Loading follow-ups...</p>
          </div>
        ) : followUps.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <p className="text-slate-500 text-sm mb-1">No follow-ups found.</p>
            <p className="text-slate-400 text-xs mb-4">
              Add follow-ups from an application's detail view to track them here.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">App status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {followUps.map((f) => {
                  const appStatus = f.application?.status;
                  const urgency = formatDueUrgency(f.dueAt, f.completed, appStatus);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {f.application?.job?.title || "Untitled Job"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {f.application?.job?.companyName || "Unknown company"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {FOLLOW_UP_ACTION_LABELS[f.action]}
                        </p>
                        {f.note && (
                          <p className="text-xs text-slate-500 max-w-[220px] truncate">
                            {f.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(f.dueAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                              URGENCY_STYLES[urgency] || URGENCY_STYLES.Upcoming
                            }`}
                          >
                            {urgency}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                              PRIORITY_STYLES[f.priority] || PRIORITY_STYLES.medium
                            }`}
                          >
                            {FOLLOW_UP_PRIORITIES_LABELS[f.priority]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {appStatus && (
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${
                              STATUS_BADGES[appStatus] || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {appStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/dashboard/applications?id=${f.application?._id}`)}
                          className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
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
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.totalPages || loading}
              className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {pagination.total > 0 && pagination.totalPages <= 1 && (
          <div className="text-center mt-4 text-xs text-slate-400">
            {pagination.total} follow-up(s)
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default FollowUps;
