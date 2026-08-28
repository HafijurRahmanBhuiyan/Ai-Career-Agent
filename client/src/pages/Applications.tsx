import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import {
  Application,
  ApplicationPagination,
  ApplicationStatus,
  ApplicationDetail,
  ActionSummary,
  PreparationSummary,
  TimelineEvent,
  TimelineEventType,
  TimelineResponse,
  ExecutionInfo,
  CapabilityInfo,
  JobFitAssistResult,
} from "../types/application";
import {
  InterviewPreparation,
  InterviewChecklistItem,
  PrepAssistSuggestions,
  CHECKLIST_KEYS,
  ChecklistKey,
} from "../types/interviewPreparation";
import {
  ApplicationFollowUp,
  FollowUpAction,
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_PRIORITIES,
  FOLLOW_UP_PRIORITIES_LABELS,
  FollowUpPriority,
  FollowUpSuggestion,
  formatDueUrgency,
} from "../types/followUp";
import { getErrorMessage } from "../utils/apiError";

const API_BASE = "";
const PAGE_SIZE = 10;

const STATUS_OPTIONS: {
  value: ApplicationStatus | "";
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  saved: "bg-slate-100 text-slate-700",
  applied: "bg-blue-50 text-blue-700",
  screening: "bg-cyan-50 text-cyan-700",
  interview: "bg-purple-50 text-purple-700",
  offer: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-amber-50 text-amber-700",
};

function Applications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");
  const isValidStatus = urlStatus
    ? STATUS_OPTIONS.some((opt) => opt.value === urlStatus)
    : false;

  const [applications, setApplications] = useState<Application[]>([]);
  const [pagination, setPagination] = useState<ApplicationPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">(
    isValidStatus ? (urlStatus as ApplicationStatus) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState<Application | null>(null);
  const [viewing, setViewing] = useState<Application | null>(null);

  // Deep-link support: /dashboard/applications?id=... opens the detail modal.
  const urlId = searchParams.get("id");
  useEffect(() => {
    if (urlId && applications.length > 0) {
      const target = applications.find((a) => a._id === urlId);
      if (target) {
        setViewing(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, applications]);

  // Keep the filter in sync with the URL query parameter (e.g. from dashboard links).
  useEffect(() => {
    const current = searchParams.get("status");
    const next = current && STATUS_OPTIONS.some((o) => o.value === current)
      ? (current as ApplicationStatus)
      : "";
    setStatusFilter(next);
  }, [searchParams]);

  const handleStatusSelect = (value: ApplicationStatus | "") => {
    setStatusFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    setSearchParams(params);
  };

  const buildQuery = useCallback((page: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    return params.toString();
  }, [statusFilter]);

  const fetchApplications = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{
          applications: Application[];
          pagination: ApplicationPagination;
        }>(`${API_BASE}/applications?${buildQuery(page)}`);
        setApplications(res.data.applications);
        setPagination(res.data.pagination);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load applications"));
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    fetchApplications(1);
  }, [fetchApplications]);

  const handleFilter = () => {
    fetchApplications(1);
  };

  const handlePageChange = (page: number) => {
    fetchApplications(page);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`${API_BASE}/applications/${deleting._id}`);
      setDeleting(null);
      fetchApplications(pagination.page);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to delete application"));
    }
  };

  return (
    <DashboardLayout active="My Applications">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">My Applications</h1>
          <p className="text-slate-500 mt-1">
            Track every job you apply to — from saved to offer
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-4">
              Dismiss
            </button>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  handleStatusSelect(e.target.value as ApplicationStatus | "")
                }
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleFilter}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply Filter
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <p className="text-slate-500 text-sm mb-1">No applications yet.</p>
            <p className="text-slate-400 text-xs mb-4">
              Track jobs you are interested in so you can follow them from saved to offer.
              Open the Jobs page and click "Track Application" on a job.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {app.job?.title || "Untitled Job"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[app.job?.companyName, app.job?.location]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[app.status]}`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {app.appliedAt ? formatDate(app.appliedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs max-w-[180px]">
                      <span className="line-clamp-2">{app.notes || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setViewing(app)}
                        className="px-3 py-1.5 text-xs text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors mr-2"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => setEditing(app)}
                        className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleting(app)}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {pagination.total > 0 && pagination.totalPages <= 1 && (
          <div className="text-center mt-4 text-xs text-slate-400">
            {pagination.total} application(s)
          </div>
        )}
      </div>

      {editing && (
        <EditApplicationModal
          application={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setApplications((prev) =>
              prev.map((a) => (a._id === updated._id ? updated : a))
            );
            setEditing(null);
          }}
        />
      )}

      {viewing && (
        <ApplicationDetailModal
          application={viewing}
          onClose={() => setViewing(null)}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Delete application?
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              This will remove your application for{" "}
              <span className="font-medium text-slate-900">
                {deleting.job?.title || "this job"}
              </span>
              . This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function EditApplicationModal({
  application,
  onClose,
  onSaved,
}: {
  application: Application;
  onClose: () => void;
  onSaved: (app: Application) => void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [appliedAt, setAppliedAt] = useState(
    application.appliedAt ? toDateInputValue(application.appliedAt) : ""
  );
  const [notes, setNotes] = useState(application.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string | null> = {
        status,
        notes: notes.trim() || null,
        appliedAt: appliedAt ? new Date(appliedAt).toISOString() : null,
      };

      const res = await api.patch<{ application: Application }>(
        `${API_BASE}/applications/${application._id}`,
        payload
      );
      onSaved(res.data.application);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update application"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit Application</h2>
            <p className="text-sm text-slate-600 mt-1">
              {application.job?.title || "Untitled Job"} · {application.job?.companyName || ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.filter((o) => o.value !== "").map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Applied Date
            </label>
            <input
              type="date"
              value={appliedAt}
              onChange={(e) => setAppliedAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Add notes about this application..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationDetailModal({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newType, setNewType] = useState<TimelineEventType>("note");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(toTodayInputValue());
  const [newDescription, setNewDescription] = useState("");

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  const [preparation, setPreparation] = useState<InterviewPreparation | null>(null);
  const [followUps, setFollowUps] = useState<ApplicationFollowUp[]>([]);
  const [actionSummary, setActionSummary] = useState<ActionSummary | null>(null);
  const [preparationSummary, setPreparationSummary] = useState<PreparationSummary | null>(null);
  const [prepSaving, setPrepSaving] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, t] = await Promise.all([
        api.get<ApplicationDetail>(`${API_BASE}/applications/${application._id}`),
        api.get<TimelineResponse>(`${API_BASE}/applications/${application._id}/timeline?limit=100`),
      ]);
      setDetail(d.data);
      setEvents(t.data.events);
      setSummary(d.data.aiSummary as Record<string, unknown> | null);
      setPreparation((d.data.preparation as InterviewPreparation) ?? null);
      setFollowUps(d.data.followUps ?? []);
      setActionSummary(d.data.actionSummary ?? null);
      setPreparationSummary(d.data.preparationSummary ?? null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load application details"));
    } finally {
      setLoading(false);
    }
  }, [application._id]);

  const reloadFollowUps = useCallback(async () => {
    try {
      const res = await api.get<{ followUps: ApplicationFollowUp[] }>(
        `${API_BASE}/applications/${application._id}/follow-ups?limit=50`
      );
      setFollowUps(res.data.followUps);
    } catch {
      // ignore refresh errors in modal
    }
  }, [application._id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const reloadTimeline = useCallback(async () => {
    try {
      const t = await api.get<TimelineResponse>(
        `${API_BASE}/applications/${application._id}/timeline?limit=100`
      );
      setEvents(t.data.events);
    } catch {
      // ignore refresh errors in modal
    }
  }, [application._id]);

  const handleAddEvent = async () => {
    if (!newTitle.trim()) {
      setError("Title is required for a new timeline event.");
      return;
    }
    setError(null);
    try {
      await api.post(`${API_BASE}/applications/${application._id}/timeline`, {
        type: newType,
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        eventDate: new Date(newDate).toISOString(),
      });
      setNewTitle("");
      setNewDescription("");
      await reloadTimeline();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to add timeline event"));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setError(null);
    try {
      await api.delete(
        `${API_BASE}/applications/${application._id}/timeline/${eventId}`
      );
      await reloadTimeline();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to delete timeline event"));
    }
  };

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    setError(null);
    try {
      const res = await api.post<{ summary: Record<string, unknown> }>(
        `${API_BASE}/applications/${application._id}/summary`
      );
      setSummary(res.data.summary);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to generate AI summary"));
    } finally {
      setSummaryLoading(false);
    }
  };

  const jobTitle = detail?.application?.job?.title || "Untitled Job";
  const companyName = detail?.application?.job?.companyName || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{jobTitle}</h2>
            <p className="text-sm text-slate-600 mt-1">{companyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
              <p className="text-slate-500 text-sm">Loading details...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Overview</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Status</p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[detail?.application?.status || application.status]}`}
                    >
                      {detail?.application?.status || application.status}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Applied</p>
                    <p className="font-medium text-slate-900 mt-1">
                      {detail?.application?.appliedAt
                        ? formatDate(detail.application.appliedAt)
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-slate-500">Notes</p>
                    <p className="font-medium text-slate-900 mt-1 whitespace-pre-wrap break-words">
                      {detail?.application?.notes || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">
                  Timeline ({events.length})
                </h3>
                <div className="space-y-2">
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-400">No timeline events yet.</p>
                  ) : (
                    events.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start justify-between gap-2 border border-slate-200 rounded-lg p-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${EVENT_TYPE_STYLES[event.type] || "bg-slate-100 text-slate-600"}`}
                            >
                              {event.type}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {event.source}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 mt-1">
                            {event.title}
                          </p>
                          {event.description && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              {event.description}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatDateTime(event.eventDate)}
                          </p>
                        </div>
                        {event.source === "user" && (
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="text-xs text-red-500 hover:text-red-700 shrink-0"
                            title="Delete event"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-600">Add manual event</p>
                  <div className="flex gap-2">
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as TimelineEventType)}
                      className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {EVENT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Event title (e.g. Called recruiter)"
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddEvent}
                    className="w-full px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add event
                  </button>
                </div>
              </div>

              {(detail?.emails?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">
                    Related emails ({detail?.emails.length})
                  </h3>
                  <div className="space-y-2">
                    {detail?.emails.map((email) => (
                      <div
                        key={email.id || email.gmailMessageId}
                        className="border border-slate-200 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">
                            {email.subject || "Email"}
                          </p>
                          {email.category && (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">
                              {email.category}
                            </span>
                          )}
                        </div>
                        {email.summary && (
                          <p className="text-xs text-slate-600 mt-1">
                            {email.summary}
                          </p>
                        )}
                        {email.receivedAt && (
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDateTime(email.receivedAt)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(detail?.interview?.scheduledAt ||
                detail?.interview?.interviewer ||
                detail?.interview?.meetingUrl ||
                detail?.interview?.type ||
                detail?.interview?.location) && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">
                    Upcoming interview
                  </h3>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1 text-sm">
                    {detail?.interview?.scheduledAt && (
                      <p className="text-slate-800">
                        <span className="text-slate-500">When: </span>
                        {formatDateTime(detail.interview.scheduledAt)}
                      </p>
                    )}
                    {detail?.interview?.type && (
                      <p className="text-slate-800">
                        <span className="text-slate-500">Type: </span>
                        {detail.interview.type}
                      </p>
                    )}
                    {detail?.interview?.interviewer && (
                      <p className="text-slate-800">
                        <span className="text-slate-500">Interviewer: </span>
                        {detail.interview.interviewer}
                      </p>
                    )}
                    {detail?.interview?.meetingUrl && (
                      <p className="text-slate-800 break-all">
                        <span className="text-slate-500">Link: </span>
                        {detail.interview.meetingUrl}
                      </p>
                    )}
                    {detail?.interview?.location && (
                      <p className="text-slate-800">
                        <span className="text-slate-500">Location: </span>
                        {detail.interview.location}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <ActionCenter
                actionSummary={actionSummary}
                preparationSummary={preparationSummary}
                applicationStatus={detail?.application?.status || application.status}
              />

              <ApplicationExecutionSection
                applicationId={application._id}
                onApplied={async () => {
                  await reloadTimeline();
                  await loadDetail();
                }}
                setError={setError}
              />

              <JobFitAssistSection
                applicationId={application._id}
                setError={setError}
              />

              <PreparationSection
                applicationId={application._id}
                preparation={preparation}
                onPreparationChange={setPreparation}
                saving={prepSaving}
                setSaving={setPrepSaving}
                setError={setError}
              />

              <FollowUpsSection
                applicationId={application._id}
                followUps={followUps}
                onReload={async () => {
                  await reloadFollowUps();
                  await loadDetail();
                }}
                setError={setError}
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    AI summary
                  </h3>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={summaryLoading}
                    className="px-3 py-1.5 text-xs text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {summaryLoading ? "Generating..." : summary ? "Regenerate" : "Generate summary"}
                  </button>
                </div>
                {summary ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2 text-sm">
                    <p className="text-slate-800">{String(summary.summary || "")}</p>
                    {Boolean(summary.currentSituation) && (
                      <p className="text-slate-600">
                        <span className="font-medium">Current situation: </span>
                        {String(summary.currentSituation)}
                      </p>
                    )}
                    {Array.isArray(summary.strengths) && (summary.strengths as string[]).length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-medium">Strengths: </span>
                        {(summary.strengths as string[]).join("; ")}
                      </p>
                    )}
                    {Array.isArray(summary.risks) && (summary.risks as string[]).length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-medium">Risks: </span>
                        {(summary.risks as string[]).join("; ")}
                      </p>
                    )}
                    {Array.isArray(summary.nextActions) && (summary.nextActions as string[]).length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-medium">Next actions: </span>
                        {(summary.nextActions as string[]).join("; ")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No summary yet. Generate an AI summary of this application.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EVENT_TYPE_OPTIONS: { value: TimelineEventType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "interview_scheduled", label: "Interview" },
  { value: "recruiter_contact", label: "Recruiter contact" },
  { value: "assessment", label: "Assessment" },
  { value: "offer_received", label: "Offer" },
  { value: "rejection_received", label: "Rejection" },
  { value: "other", label: "Other" },
];

const CAPABILITY_LABELS: Record<string, string> = {
  external_url: "External site",
  supported_api: "Supported API",
  manual_required: "Manual required",
};

const CAPABILITY_STYLES: Record<string, string> = {
  external_url: "bg-blue-50 text-blue-700",
  supported_api: "bg-teal-50 text-teal-700",
  manual_required: "bg-amber-50 text-amber-700",
};

const JOB_FIT_STYLES: Record<string, string> = {
  strong: "bg-emerald-50 text-emerald-700",
  moderate: "bg-blue-50 text-blue-700",
  weak: "bg-amber-50 text-amber-700",
  uncertain: "bg-slate-100 text-slate-600",
};

function ApplicationExecutionSection({
  applicationId,
  onApplied,
  setError,
}: {
  applicationId: string;
  onApplied: () => void;
  setError: (msg: string | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ExecutionInfo | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preparedInstructions, setPreparedInstructions] = useState<string | null>(null);
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingOpen, setConfirmingOpen] = useState(false);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ExecutionInfo>(
        `${API_BASE}/applications/${applicationId}/execution`
      );
      setInfo(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load application execution info"));
    } finally {
      setLoading(false);
    }
  }, [applicationId, setError]);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const handlePrepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      const res = await api.post<{
        instructions: string;
        capabilityInfo: CapabilityInfo;
      }>(`${API_BASE}/applications/${applicationId}/execution/prepare`);
      setPreparedInstructions(res.data.instructions);
      setHandoffUrl(res.data.capabilityInfo.handoffUrl);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to prepare application"));
    } finally {
      setPreparing(false);
    }
  };

  const handleConfirmApplied = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await api.post<{ statusChanged: boolean; message: string }>(
        `${API_BASE}/applications/${applicationId}/execution`,
        { submitted: true }
      );
      setConfirmingOpen(false);
      onApplied();
      if (res.data.message) {
        setPreparedInstructions(res.data.message);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to confirm application"));
    } finally {
      setConfirming(false);
    }
  };

  const capability = info?.capabilityInfo;
  const alreadyApplied = info?.application.status === "applied";

  return (
    <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Apply & Track</h3>
        {loading && <p className="text-xs text-slate-400">Loading...</p>}
      </div>

      {!loading && capability && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${CAPABILITY_STYLES[capability.capability] || "bg-slate-100 text-slate-600"}`}>
              {capability.label || CAPABILITY_LABELS[capability.capability] || capability.capability}
            </span>
            {alreadyApplied && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700">
                applied
              </span>
            )}
          </div>

          {!alreadyApplied && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handlePrepare}
                disabled={preparing}
                className="px-3 py-1.5 text-xs text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                {preparing ? "Preparing..." : "Review & prepare"}
              </button>
              <button
                onClick={() => setConfirmingOpen(true)}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm applied
              </button>
            </div>
          )}

          {handoffUrl && (
            <div className="flex items-center gap-2">
              <a
                href={handoffUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Open application site
              </a>
            </div>
          )}

          {preparedInstructions && (
            <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
              {preparedInstructions}
            </p>
          )}

          {!alreadyApplied && (
            <p className="text-[10px] text-slate-500">
              Applying is always completed on the employer's own site. Confirming
              "applied" is the only action that records the application here.
            </p>
          )}
        </>
      )}

      {confirmingOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Confirm applied?</h4>
            <p className="text-xs text-slate-600">
              Confirm only if you actually completed and submitted the application on
              the employer's site. This records the application as "applied".
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmingOpen(false)}
                disabled={confirming}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApplied}
                disabled={confirming}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {confirming ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JobFitAssistSection({
  applicationId,
  setError,
}: {
  applicationId: string;
  setError: (msg: string | null) => void;
}) {
  const [result, setResult] = useState<JobFitAssistResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAssist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<JobFitAssistResult>(
        `${API_BASE}/applications/${applicationId}/fit-assist`
      );
      setResult(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to get job-fit assist"));
    } finally {
      setLoading(false);
    }
  };

  const a = result?.assessment;

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Job-fit assist</h3>
        <button
          onClick={handleAssist}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Analyzing..." : result ? "Re-run" : "Run assist"}
        </button>
      </div>

      {result?.advisoryOnly && (
        <p className="text-[10px] text-slate-500">
          Advisory only — this never changes your application status.
        </p>
      )}

      {a ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${JOB_FIT_STYLES[a.overallFit] || "bg-slate-100 text-slate-600"}`}
            >
              {a.overallFit} fit
            </span>
          </div>
          <p className="text-slate-700">{a.summary}</p>
          {a.highlights.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Highlights</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {a.highlights.map((h, i) => (
                  <li key={i} className="text-xs text-slate-700">{h}</li>
                ))}
              </ul>
            </div>
          )}
          {a.gaps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Gaps</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {a.gaps.map((g, i) => (
                  <li key={i} className="text-xs text-slate-700">{g}</li>
                ))}
              </ul>
            </div>
          )}
          {a.uncertainties.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Uncertainties</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {a.uncertainties.map((u, i) => (
                  <li key={i} className="text-xs text-slate-700">{u}</li>
                ))}
              </ul>
            </div>
          )}
          {a.suggestedQuestionsToAskEmployer.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">
                Questions to ask the employer
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {a.suggestedQuestionsToAskEmployer.map((q, i) => (
                  <li key={i} className="text-xs text-slate-700">{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Get an advisory assessment of how your profile matches this role.
        </p>
      )}
    </div>
  );
}

function PreparationSection({
  applicationId,
  preparation,
  onPreparationChange,
  saving,
  setSaving,
  setError,
}: {
  applicationId: string;
  preparation: InterviewPreparation | null;
  onPreparationChange: (prep: InterviewPreparation) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  setError: (msg: string | null) => void;
}) {
  const [notes, setNotes] = useState(preparation?.notes ?? "");
  const [goals, setGoals] = useState(preparation?.goals ?? []);
  const [talkingPoints, setTalkingPoints] = useState(preparation?.talkingPoints ?? []);
  const [questionsToAsk, setQuestionsToAsk] = useState(preparation?.questionsToAsk ?? []);
  const [companyResearchNotes, setCompanyResearchNotes] = useState(
    preparation?.companyResearchNotes ?? ""
  );
  const [rolePreparationNotes, setRolePreparationNotes] = useState(
    preparation?.rolePreparationNotes ?? ""
  );
  const [checklist, setChecklist] = useState<InterviewChecklistItem[]>(
    preparation?.checklist ??
      CHECKLIST_KEYS.map((key) => ({
        key,
        label: CHECKLIST_LABELS[key],
        completed: false,
        completedAt: null,
      }))
  );

  const [assistLoading, setAssistLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PrepAssistSuggestions | null>(null);

  // Sync local state when the loaded preparation changes.
  useEffect(() => {
    if (!preparation) return;
    setNotes(preparation.notes ?? "");
    setGoals(preparation.goals ?? []);
    setTalkingPoints(preparation.talkingPoints ?? []);
    setQuestionsToAsk(preparation.questionsToAsk ?? []);
    setCompanyResearchNotes(preparation.companyResearchNotes ?? "");
    setRolePreparationNotes(preparation.rolePreparationNotes ?? "");
    if (preparation.checklist && preparation.checklist.length > 0) {
      setChecklist(preparation.checklist);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparation]);

  const toggleChecklist = (key: ChecklistKey) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              completed: !item.completed,
              completedAt: !item.completed ? new Date().toISOString() : null,
            }
          : item
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        notes: notes.trim() || null,
        goals,
        talkingPoints,
        questionsToAsk,
        companyResearchNotes: companyResearchNotes.trim() || null,
        rolePreparationNotes: rolePreparationNotes.trim() || null,
        checklist,
      };
      const res = await api.put<{ preparation: InterviewPreparation }>(
        `${API_BASE}/applications/${applicationId}/preparation`,
        payload
      );
      onPreparationChange(res.data.preparation);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save preparation"));
    } finally {
      setSaving(false);
    }
  };

  const handleAssist = async () => {
    setAssistLoading(true);
    setError(null);
    try {
      const res = await api.post<{ suggestions: PrepAssistSuggestions }>(
        `${API_BASE}/applications/${applicationId}/preparation/assist`
      );
      setSuggestions(res.data.suggestions);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to generate suggestions"));
    } finally {
      setAssistLoading(false);
    }
  };

  const applySuggestion = (
    field: "goals" | "talkingPoints" | "questionsToAsk",
    value: string
  ) => {
    if (field === "goals") {
      setGoals((prev) => (prev.includes(value) ? prev : [...prev, value]));
    } else if (field === "talkingPoints") {
      setTalkingPoints((prev) => (prev.includes(value) ? prev : [...prev, value]));
    } else {
      setQuestionsToAsk((prev) => (prev.includes(value) ? prev : [...prev, value]));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-800">Interview preparation</h3>
        <button
          onClick={handleAssist}
          disabled={assistLoading}
          className="px-3 py-1.5 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          {assistLoading ? "Generating..." : "Ask AI for suggestions"}
        </button>
      </div>

      <div className="border border-slate-200 rounded-lg p-3 space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Checklist</p>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleChecklist(item.key)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span
                  className={
                    item.completed ? "line-through text-slate-400" : "text-slate-700"
                  }
                >
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {suggestions && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-800">
              AI suggestions (click to add)
            </p>
            {suggestions.suggestedGoals.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-emerald-700 mb-1">Goals</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.suggestedGoals.map((s) => (
                    <button
                      key={s}
                      onClick={() => applySuggestion("goals", s)}
                      className="text-xs px-2 py-0.5 bg-white border border-emerald-300 rounded-full hover:bg-emerald-100"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {suggestions.suggestedTalkingPoints.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-emerald-700 mb-1">Talking points</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.suggestedTalkingPoints.map((s) => (
                    <button
                      key={s}
                      onClick={() => applySuggestion("talkingPoints", s)}
                      className="text-xs px-2 py-0.5 bg-white border border-emerald-300 rounded-full hover:bg-emerald-100"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {suggestions.suggestedQuestionsToAsk.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-emerald-700 mb-1">Questions to ask</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.suggestedQuestionsToAsk.map((s) => (
                    <button
                      key={s}
                      onClick={() => applySuggestion("questionsToAsk", s)}
                      className="text-xs px-2 py-0.5 bg-white border border-emerald-300 rounded-full hover:bg-emerald-100"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">General notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={10000}
            placeholder="Overall preparation notes..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Goals</p>
          <StringListEditor
            placeholder="Add a goal and press Enter"
            items={goals}
            onChange={setGoals}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Talking points</p>
          <StringListEditor
            placeholder="Add a talking point and press Enter"
            items={talkingPoints}
            onChange={setTalkingPoints}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Questions to ask</p>
          <StringListEditor
            placeholder="Add a question and press Enter"
            items={questionsToAsk}
            onChange={setQuestionsToAsk}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Company research notes</p>
          <textarea
            value={companyResearchNotes}
            onChange={(e) => setCompanyResearchNotes(e.target.value)}
            rows={2}
            maxLength={10000}
            placeholder="Notes about the company..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Role preparation notes</p>
          <textarea
            value={rolePreparationNotes}
            onChange={(e) => setRolePreparationNotes(e.target.value)}
            rows={2}
            maxLength={10000}
            placeholder="Notes for this specific role..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Preparation"}
        </button>
      </div>
    </div>
  );
}

function StringListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = input.trim();
      if (value && !items.includes(value)) {
        onChange([...items, value]);
        setInput("");
      }
    }
  };

  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <button
              key={`${item}-${index}`}
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              title="Remove"
              className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full hover:bg-red-50 hover:text-red-600"
            >
              {item} ×
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  resume_reviewed: "Resume reviewed",
  job_description_reviewed: "Job description reviewed",
  company_researched: "Company researched",
  star_stories_prepared: "STAR stories prepared",
  technical_topics_prepared: "Technical topics prepared",
  behavioral_topics_prepared: "Behavioral topics prepared",
  interviewer_questions_prepared: "Interviewer questions prepared",
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

function FollowUpsSection({
  applicationId,
  followUps,
  onReload,
  setError,
}: {
  applicationId: string;
  followUps: ApplicationFollowUp[];
  onReload: () => void | Promise<void>;
  setError: (msg: string | null) => void;
}) {
  const [action, setAction] = useState<FollowUpAction>("recruiter_follow_up");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(toTodayInputValue());
  const [priority, setPriority] = useState<FollowUpPriority>("medium");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApplicationFollowUp | null>(null);
  const [editAction, setEditAction] = useState<FollowUpAction>("custom");
  const [editNote, setEditNote] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<FollowUpPriority>("medium");
  const [confirmDelete, setConfirmDelete] = useState<ApplicationFollowUp | null>(null);
  const [assistLoading, setAssistLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([]);

  const open = followUps.filter((f) => !f.completed);
  const completed = followUps.filter((f) => f.completed);

  const sortOpen = (list: ApplicationFollowUp[]) =>
    [...list].sort((a, b) => {
      const order = (f: ApplicationFollowUp) =>
        new Date(f.dueAt).getTime() < Date.now() ? 0 : 1;
      const rankDiff = order(a) - order(b);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

  const handleAdd = async () => {
    setAdding(true);
    setError(null);
    try {
      await api.post(`${API_BASE}/applications/${applicationId}/follow-ups`, {
        action,
        note: note.trim() || null,
        dueAt: new Date(dueDate).toISOString(),
        priority,
      });
      setNote("");
      await onReload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to add follow-up"));
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (f: ApplicationFollowUp) => {
    setEditing(f);
    setEditAction(f.action);
    setEditNote(f.note ?? "");
    setEditPriority(f.priority ?? "medium");
    setEditDueDate(toDateInputValue(f.dueAt));
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setError(null);
    try {
      await api.patch(
        `${API_BASE}/applications/${applicationId}/follow-ups/${editing.id}`,
        {
          action: editAction,
          note: editNote.trim() || null,
          dueAt: new Date(editDueDate).toISOString(),
          priority: editPriority,
        }
      );
      setEditing(null);
      await onReload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update follow-up"));
    }
  };

  const toggleComplete = async (followUp: ApplicationFollowUp) => {
    setError(null);
    try {
      await api.patch(
        `${API_BASE}/applications/${applicationId}/follow-ups/${followUp.id}`,
        { completed: !followUp.completed }
      );
      await onReload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update follow-up"));
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setError(null);
    try {
      await api.delete(
        `${API_BASE}/applications/${applicationId}/follow-ups/${confirmDelete.id}`
      );
      setConfirmDelete(null);
      await onReload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to delete follow-up"));
    }
  };

  const handleAssist = async () => {
    setAssistLoading(true);
    setError(null);
    try {
      const res = await api.post<{ suggestions: FollowUpSuggestion[] }>(
        `${API_BASE}/applications/${applicationId}/follow-ups/assist`
      );
      setSuggestions(res.data.suggestions ?? []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to generate follow-up suggestions"));
    } finally {
      setAssistLoading(false);
    }
  };

  const addSuggestion = async (s: FollowUpSuggestion) => {
    setAdding(true);
    setError(null);
    try {
      await api.post(`${API_BASE}/applications/${applicationId}/follow-ups`, {
        action: s.action,
        note: s.note?.trim() || null,
        dueAt: s.dueDate
          ? new Date(s.dueDate).toISOString()
          : new Date(dueDate).toISOString(),
        priority: s.priority,
      });
      setSuggestions((prev) => prev.filter((x) => x !== s));
      await onReload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save suggestion"));
    } finally {
      setAdding(false);
    }
  };

  const renderFollowUp = (f: ApplicationFollowUp) => {
    const urgency = formatDueUrgency(f.dueAt, f.completed, undefined);
    return (
      <div
        key={f.id}
        className="flex items-start justify-between gap-2 border border-slate-100 rounded-lg p-2.5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900">
              {FOLLOW_UP_ACTION_LABELS[f.action]}
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                f.completed
                  ? URGENCY_STYLES.Completed
                  : URGENCY_STYLES[urgency] || URGENCY_STYLES.Upcoming
              }`}
            >
              {f.completed ? "Completed" : urgency}
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                PRIORITY_STYLES[f.priority] || PRIORITY_STYLES.medium
              }`}
            >
              {FOLLOW_UP_PRIORITIES_LABELS[f.priority]}
            </span>
          </div>
          {f.note && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{f.note}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-0.5">
            Due {formatDateTime(f.dueAt)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => openEdit(f)}
            className="text-xs px-2 py-1 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => toggleComplete(f)}
            className="text-xs px-2 py-1 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {f.completed ? "Reopen" : "Complete"}
          </button>
          <button
            onClick={() => setConfirmDelete(f)}
            className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Follow-ups</h3>
        <button
          onClick={handleAssist}
          disabled={assistLoading}
          className="px-3 py-1.5 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          {assistLoading ? "Generating..." : "Ask AI for follow-up suggestions"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800">
            AI follow-up suggestions (review and click to add)
          </p>
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              className="bg-white border border-emerald-300 rounded-lg p-2.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-900">
                  {FOLLOW_UP_ACTION_LABELS[s.action]}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                    PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.medium
                  }`}
                >
                  {FOLLOW_UP_PRIORITIES_LABELS[s.priority]}
                </span>
                {s.dueDate && (
                  <span className="text-[10px] text-slate-400">
                    Due {formatDate(s.dueDate)}
                  </span>
                )}
              </div>
              {s.note && (
                <p className="text-xs text-slate-700 mt-1">{s.note}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">{s.reason}</p>
              <button
                onClick={() => addSuggestion(s)}
                disabled={adding}
                className="mt-2 px-3 py-1 text-xs text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                Add suggestion
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-slate-200 rounded-lg p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5">
            Open ({open.length})
          </p>
          {sortOpen(open).length === 0 ? (
            <p className="text-sm text-slate-400">No open follow-ups.</p>
          ) : (
            <div className="space-y-1.5">{sortOpen(open).map(renderFollowUp)}</div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-600 mb-1.5">
            Completed ({completed.length})
          </p>
          {completed.length === 0 ? (
            <p className="text-sm text-slate-400">No completed follow-ups.</p>
          ) : (
            <div className="space-y-1.5">{completed.map(renderFollowUp)}</div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-2 space-y-2">
          <p className="text-xs font-medium text-slate-600">Add follow-up</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as FollowUpAction)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FOLLOW_UP_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {FOLLOW_UP_ACTION_LABELS[a]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as FollowUpPriority)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FOLLOW_UP_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {FOLLOW_UP_PRIORITIES_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="w-full px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add follow-up"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Edit follow-up
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Action
                </label>
                <select
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as FollowUpAction)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FOLLOW_UP_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {FOLLOW_UP_ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Due date
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Priority
                </label>
                <select
                  value={editPriority}
                  onChange={(e) =>
                    setEditPriority(e.target.value as FollowUpPriority)
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FOLLOW_UP_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {FOLLOW_UP_PRIORITIES_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Optional note"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Delete follow-up?
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              This will permanently remove the "
              {FOLLOW_UP_ACTION_LABELS[confirmDelete.action]}" follow-up.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCenter({
  actionSummary,
  preparationSummary,
  applicationStatus,
}: {
  actionSummary: ActionSummary | null;
  preparationSummary: PreparationSummary | null;
  applicationStatus: string;
}) {
  const inactive =
    applicationStatus === "rejected" || applicationStatus === "withdrawn";

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-2">
        Action Center
      </h3>
      <div className="border border-slate-200 rounded-lg p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-slate-900">
              {actionSummary?.open ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Open actions</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-red-700">
              {actionSummary?.overdue ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Overdue</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-amber-700">
              {actionSummary?.dueToday ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Due today</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-emerald-700">
              {actionSummary?.completed ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Completed</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-slate-600">
          <span>Upcoming: {actionSummary?.upcoming ?? 0}</span>
          <span>High priority open: {actionSummary?.highPriorityOpen ?? 0}</span>
          <span>Total: {actionSummary?.total ?? 0}</span>
          {inactive && (
            <span className="text-slate-400">
              Application is {applicationStatus} — follow-ups not counted as urgent.
            </span>
          )}
        </div>
        {preparationSummary && preparationSummary.totalChecklistItems > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="text-xs font-medium text-slate-600 mb-1">
              Preparation
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${preparationSummary.completionPercent}%` }}
                />
              </div>
              <span className="text-xs text-slate-600 shrink-0">
                {preparationSummary.completedChecklistItems}/
                {preparationSummary.totalChecklistItems} (
                {preparationSummary.completionPercent}%)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  application_created: "bg-slate-100 text-slate-600",
  status_changed: "bg-blue-50 text-blue-700",
  interview_scheduled: "bg-purple-50 text-purple-700",
  recruiter_contact: "bg-cyan-50 text-cyan-700",
  assessment: "bg-amber-50 text-amber-700",
  offer_received: "bg-emerald-50 text-emerald-700",
  rejection_received: "bg-red-50 text-red-700",
  note: "bg-slate-100 text-slate-600",
  other: "bg-slate-100 text-slate-600",
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function toTodayInputValue(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function toDateInputValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default Applications;
