import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import {
  Application,
  ApplicationPagination,
  ApplicationStatus,
  ApplicationDetail,
  TimelineEvent,
  TimelineEventType,
  TimelineResponse,
} from "../types/application";
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
  const [applications, setApplications] = useState<Application[]>([]);
  const [pagination, setPagination] = useState<ApplicationPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState<Application | null>(null);
  const [viewing, setViewing] = useState<Application | null>(null);

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
                onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "")}
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load application details"));
    } finally {
      setLoading(false);
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
