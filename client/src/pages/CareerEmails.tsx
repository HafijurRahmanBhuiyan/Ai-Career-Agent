import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import {
  ApplicationStatus,
  CareerEmail,
  CareerEmailCategory,
  CareerEmailLinkedApplication,
  CareerEmailPagination,
  CareerEvent,
  DetectedCareerStatus,
} from "../types/careerEmail";
import { getErrorMessage } from "../utils/apiError";
import { validateHandoffUrl } from "../utils/handoffUrl";
import {
  buildInterviewIcs,
  buildReplyDraft,
  copyToClipboard,
  deadlineCountdown,
  downloadIcs,
} from "../utils/careerEvent";

const API_BASE = "";
const PAGE_SIZE = 10;

const CATEGORY_OPTIONS: { value: CareerEmailCategory | ""; label: string }[] = [
  { value: "", label: "All categories" },
  { value: "recruiter_outreach", label: "Recruiter Outreach" },
  { value: "application_received", label: "Application Received" },
  { value: "application_update", label: "Application Update" },
  { value: "interview_invitation", label: "Interview Invitation" },
  { value: "interview_reschedule", label: "Interview Reschedule" },
  { value: "assessment", label: "Assessment" },
  { value: "rejection", label: "Rejection" },
  { value: "offer", label: "Offer" },
  { value: "follow_up", label: "Follow Up" },
  { value: "networking", label: "Networking" },
  { value: "unrelated", label: "Unrelated" },
];

const STATUS_OPTIONS: { value: ApplicationStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const CATEGORY_STYLES: Record<CareerEmailCategory, string> = {
  recruiter_outreach: "bg-sky-50 text-sky-700",
  application_received: "bg-blue-50 text-blue-700",
  application_update: "bg-cyan-50 text-cyan-700",
  interview_invitation: "bg-purple-50 text-purple-700",
  interview_reschedule: "bg-violet-50 text-violet-700",
  assessment: "bg-indigo-50 text-indigo-700",
  rejection: "bg-red-50 text-red-700",
  offer: "bg-emerald-50 text-emerald-700",
  follow_up: "bg-amber-50 text-amber-700",
  networking: "bg-teal-50 text-teal-700",
  unrelated: "bg-slate-100 text-slate-600",
};

const DETECTED_STATUS_STYLES: Record<DetectedCareerStatus, string> = {
  screening: "bg-indigo-50 text-indigo-700",
  interview: "bg-purple-50 text-purple-700",
  offer: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

// Manual status application may only target hiring stages Gmail detection can
// derive. "applied" is reserved for the execution flow and "withdrawn" is
// never applied from a career email.
const DETECTED_STATUS_OPTIONS: { value: DetectedCareerStatus; label: string }[] = [
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

function isDetectedStatus(value: string | null | undefined): value is DetectedCareerStatus {
  return !!value && DETECTED_STATUS_OPTIONS.some((o) => o.value === value);
}

function formatCategory(category: CareerEmailCategory | undefined): string {
  if (!category) return "Unclassified";
  const found = CATEGORY_OPTIONS.find((opt) => opt.value === category);
  return found ? found.label : category;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function CareerEmails() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = searchParams.get("category");
  const urlStatus = searchParams.get("applicationStatus");

  const [emails, setEmails] = useState<CareerEmail[]>([]);
  const [pagination, setPagination] = useState<CareerEmailPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [categoryFilter, setCategoryFilter] = useState<CareerEmailCategory | "">(
    urlCategory && CATEGORY_OPTIONS.some((o) => o.value === urlCategory)
      ? (urlCategory as CareerEmailCategory)
      : ""
  );
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">(
    urlStatus && STATUS_OPTIONS.some((o) => o.value === urlStatus)
      ? (urlStatus as ApplicationStatus)
      : ""
  );
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<CareerEmail | null>(null);

  // Keep the category/status filters in sync with URL query parameters
  // (e.g. when navigating from the dashboard).
  useEffect(() => {
    const cat = searchParams.get("category");
    const nextCat = cat && CATEGORY_OPTIONS.some((o) => o.value === cat)
      ? (cat as CareerEmailCategory)
      : "";
    const st = searchParams.get("applicationStatus");
    const nextSt = st && STATUS_OPTIONS.some((o) => o.value === st)
      ? (st as ApplicationStatus)
      : "";
    setCategoryFilter(nextCat);
    setStatusFilter(nextSt);
  }, [searchParams]);

  const handleCategorySelect = (value: CareerEmailCategory | "") => {
    setCategoryFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("category", value);
    } else {
      params.delete("category");
    }
    setSearchParams(params);
  };

  const handleStatusSelect = (value: ApplicationStatus | "") => {
    setStatusFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("applicationStatus", value);
    } else {
      params.delete("applicationStatus");
    }
    setSearchParams(params);
  };

  const buildQuery = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("applicationStatus", statusFilter);
      if (sort) params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      return params.toString();
    },
    [categoryFilter, statusFilter, sort]
  );

  const fetchEmails = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{
          emails: CareerEmail[];
          pagination: CareerEmailPagination;
        }>(`${API_BASE}/gmail/emails?${buildQuery(page)}`);
        setEmails(res.data.emails);
        setPagination(res.data.pagination);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load career emails"));
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    fetchEmails(1);
  }, [fetchEmails]);

  const handleFilter = () => {
    fetchEmails(1);
  };

  const handlePageChange = (page: number) => {
    fetchEmails(page);
  };

  return (
    <DashboardLayout active="Career Emails">
          <div className="max-w-5xl mx-auto">
          <div className="page-header">
            <div>
              <h1 className="page-title">Career Emails</h1>
              <p className="page-subtitle">
                AI-classified emails from your Gmail, with suggested application
                status updates you can review and approve
              </p>
            </div>
          </div>

        {error && (
          <div className="alert-error mb-6 items-center">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="btn-ghost btn-sm text-red-600 -my-1 -mr-1 shrink-0 hover:bg-red-100 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full sm:w-auto">
              <label className="field-label">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  handleCategorySelect(e.target.value as CareerEmailCategory | "")
                }
                className="select"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="field-label">
                Suggested Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  handleStatusSelect(e.target.value as ApplicationStatus | "")
                }
                className="select"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="field-label">
                Sort
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
                className="select"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <button
              onClick={handleFilter}
              className="btn-primary btn-sm w-full sm:w-auto"
            >
              Apply Filter
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Emails are synced from your connected Gmail account on the
            Integrations page. Detected hiring-stage signals are shown for
            review; high-confidence signals can update your application status
            automatically when you enable that in Settings.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="spinner h-8 w-8 mb-4"></div>
            <p className="text-slate-500 text-sm">Loading career emails...</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="empty-state">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
              ✉️
            </div>
            <p className="text-slate-600 text-sm font-medium mb-1">No career emails yet.</p>
            <p className="text-slate-400 text-xs mb-4">
              Connect your Gmail account and run a sync to classify incoming
              career emails.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-wrap min-w-[900px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Subject</th>
                    <th className="th">Company</th>
                    <th className="th">Role</th>
                    <th className="th">Category</th>
                    <th className="th">Suggested Status</th>
                    <th className="th">Detected</th>
                    <th className="th">Application</th>
                    <th className="th">Received</th>
                    <th className="th text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emails.map((email) => (
                    <tr key={email.id} className="hover:bg-slate-50 transition-colors">
                      <td className="td">
                        <p className="font-medium text-slate-900 truncate max-w-xs">
                          {email.subject || "(no subject)"}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-xs">
                          {email.from || ""}
                        </p>
                      </td>
                      <td className="td">
                        {email.companyName || "—"}
                      </td>
                      <td className="td">
                        {email.jobTitle || "—"}
                      </td>
                      <td className="td">
                        <span
                          className={`badge ${
                            email.category
                              ? CATEGORY_STYLES[email.category]
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {formatCategory(email.category)}
                        </span>
                      </td>
                      <td className="td">
                        {email.suggestedApplicationStatus ? (
                          <span className="badge bg-blue-50 text-blue-700">
                            {email.suggestedApplicationStatus}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="td">
                        {email.careerStatus ? (
                          <div>
                            <span
                              className={`badge ${
                                DETECTED_STATUS_STYLES[email.careerStatus]
                              }`}
                            >
                              {email.careerStatus}
                              {email.careerStatusConfidence != null
                                ? ` ${Math.round(email.careerStatusConfidence * 100)}%`
                                : ""}
                              {email.autoStatusApplied ? " • auto" : ""}
                              {email.manualStatusApplied ? " • manual" : ""}
                            </span>
                            {email.careerStatusDetectedAt && (
                              <p className="text-[10px] text-slate-400 mt-1">
                                detected {formatDateTime(email.careerStatusDetectedAt)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                        {email.careerEvent?.type && (
                          <div className="mt-1.5 inline-flex flex-wrap items-center gap-1">
                            <span className="badge border border-emerald-200 bg-emerald-50 text-emerald-700">
                              {email.careerEvent.type.replace(/_/g, " ")}
                            </span>
                            {email.careerEvent.detectedAt && (
                              <span className="text-[10px] text-slate-400">
                                {formatDateTime(email.careerEvent.detectedAt)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="td">
                        {email.application ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-600">
                              {email.application.status || "—"}
                            </span>
                            <a
                              href={`/dashboard/applications?id=${email.application._id}`}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                            >
                              View
                            </a>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Not matched
                          </span>
                        )}
                      </td>
                      <td className="td text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(email.receivedAt)}
                      </td>
                      <td className="td text-right">
                        <button
                          onClick={() => setViewing(email)}
                          className="btn-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 hover:border-brand-300 transition-colors whitespace-nowrap"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="btn-outline btn-sm"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="btn-outline btn-sm"
            >
              Next
            </button>
          </div>
        )}

        {pagination.total > 0 && pagination.totalPages <= 1 && (
          <div className="text-center mt-4 text-xs text-slate-400">
            {pagination.total} career email(s)
          </div>
        )}
      </div>

      {viewing && (
        <EmailDetailModal
          email={viewing}
          onClose={() => setViewing(null)}
          onUpdated={(updated) => {
            setEmails((prev) =>
              prev.map((e) => (e.id === updated.id ? updated : e))
            );
            setViewing(updated);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function EmailDetailModal({
  email,
  onClose,
  onUpdated,
}: {
  email: CareerEmail;
  onClose: () => void;
  onUpdated: (updated: CareerEmail) => void;
}) {
  const [status, setStatus] = useState<DetectedCareerStatus>(
    email.careerStatus && isDetectedStatus(email.careerStatus)
      ? email.careerStatus
      : isDetectedStatus(email.suggestedApplicationStatus)
      ? email.suggestedApplicationStatus
      : "screening"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleUpdateStatus = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ application: CareerEmailLinkedApplication }>(
        `${API_BASE}/gmail/emails/${email.id}/apply-status`,
        { status }
      );
      onUpdated({
        ...email,
        application: {
          _id: res.data.application._id,
          status: res.data.application.status,
        },
      });
      setConfirming(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update application status"));
    } finally {
      setSaving(false);
    }
  };

  const info = (label: string, value?: string | null) => (
    <div>
      <dt className="text-xs font-semibold text-slate-500 mb-1">{label}</dt>
      <dd className="text-sm text-slate-900">{value || "—"}</dd>
    </div>
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-3xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100 bg-gradient-to-r from-brand-50/60 to-transparent">
          <div>
            <h2 className="page-title text-xl">
              {email.subject || "(no subject)"}
            </h2>
            <p className="text-sm text-slate-600 mt-1">{email.from || ""}</p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost h-9 w-9 shrink-0 rounded-full text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="alert-error mb-4 items-center">
              <span>{error}</span>
            </div>
          )}

          {email.category && (
            <span
              className={`badge mb-4 ${CATEGORY_STYLES[email.category]}`}
            >
              {formatCategory(email.category)}
            </span>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {info("Company", email.companyName)}
            {info("Role", email.jobTitle)}
            {info("Received", email.receivedAt ? formatDate(email.receivedAt) : null)}
            {info("Interview Date", email.interviewDate ? formatDate(email.interviewDate) : null)}
            {info("Interview Type", email.interviewType)}
            {info(
              "Action Required",
              email.actionRequired == null
                ? null
                : email.actionRequired
                ? "Yes"
                : "No"
            )}
            {info("Action Deadline", email.actionDeadline ? formatDate(email.actionDeadline) : null)}
          </dl>

          {email.careerEvent?.type && (
            <div className="bg-emerald-50 border border-emerald-200/70 rounded-2xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-emerald-900 mb-1">
                Detected Career Event
              </h3>
              <p className="text-sm text-emerald-900 font-medium capitalize">
                {email.careerEvent.type.replace(/_/g, " ")}
                {email.careerEvent.confidence != null
                  ? ` · ${Math.round(email.careerEvent.confidence * 100)}% confidence`
                  : ""}
              </p>
              {email.careerEvent.title && (
                <p className="text-sm text-emerald-800 mt-1">
                  {email.careerEvent.title}
                </p>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {info("Company", email.careerEvent.company ?? null)}
                {info("Role", email.careerEvent.role ?? null)}
                {email.careerEvent.scheduledAt
                  ? info(
                      "Scheduled",
                      `${formatDateTime(email.careerEvent.scheduledAt)}${
                        email.careerEvent.timezone
                          ? ` (${email.careerEvent.timezone})`
                          : ""
                      }`
                    )
                  : null}
                {info("Interviewer", email.careerEvent.interviewerName ?? null)}
                {info("Location", email.careerEvent.location ?? null)}
                {email.careerEvent.deadlineAt
                  ? info("Deadline", formatDateTime(email.careerEvent.deadlineAt))
                  : null}
              </dl>
              {email.careerEvent.meetingUrl &&
                validateHandoffUrl(email.careerEvent.meetingUrl) && (
                  <p className="mt-3">
                    <a
                      href={
                        validateHandoffUrl(email.careerEvent.meetingUrl) ??
                        undefined
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-700 underline font-medium"
                    >
                      Join meeting
                      {email.careerEvent.meetingPlatform
                        ? ` (${email.careerEvent.meetingPlatform})`
                        : ""}
                    </a>
                  </p>
                )}
              {email.careerEvent.actionRequired && (
                <p className="text-xs text-emerald-800 mt-3">
                  Action required: {email.careerEvent.actionText || "yes"}
                  {email.careerEvent.candidateResponseRequired
                    ? " · reply requested"
                    : ""}
                </p>
              )}
              {email.careerEvent.evidence && (
                <p className="text-xs text-emerald-700 mt-3 italic">
                  Evidence: “{email.careerEvent.evidence}”
                </p>
              )}
              {email.careerEvent.deadlineAt &&
                email.careerEvent.actionRequired && (
                  <p className="text-xs text-amber-700 mt-3">
                    ⏰{" "}
                    {deadlineCountdown(email.careerEvent.deadlineAt) ||
                      "Action required"}{" "}
                    — respond by{" "}
                    {formatDateTime(email.careerEvent.deadlineAt)}
                  </p>
                )}
              <CareerEventActions event={email.careerEvent} />
            </div>
          )}

          {email.summary && (
            <div className="mb-6">
              <p className="field-label">AI Summary</p>
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 leading-relaxed">
                {email.summary}
              </p>
            </div>
          )}

          {email.snippet && (
            <div className="mb-6">
              <p className="field-label">Excerpt</p>
              <p className="text-sm text-slate-600 leading-relaxed">{email.snippet}</p>
            </div>
          )}

          {email.confidence != null && (
            <div className="mb-6">
              <span className="chip bg-slate-100 text-slate-600">
                Classification confidence: {Math.round(email.confidence * 100)}%
              </span>
            </div>
          )}

          <div className="border-t border-slate-200 pt-6">
            {email.careerStatus && (
              <div className="bg-indigo-50 border border-indigo-200/70 rounded-2xl p-5 mb-4">
                <h3 className="text-sm font-semibold text-indigo-900 mb-1">
                  Detected Hiring Stage
                </h3>
                <p className="text-sm text-indigo-900 font-medium">
                  {email.careerStatus}
                  {email.careerStatusConfidence != null
                    ? ` · ${Math.round(email.careerStatusConfidence * 100)}% confidence`
                    : ""}
                </p>
                {email.autoStatusApplied ? (
                  <p className="text-xs text-indigo-700 mt-2">
                    This email automatically updated the linked application
                    status to {email.careerStatus}. Reason:{" "}
                    {email.autoStatusReason || "high-confidence signal detected"}.
                  </p>
                ) : email.manualStatusApplied ? (
                  <p className="text-xs text-indigo-700 mt-2">
                    You manually updated the linked application status to{" "}
                    {email.careerStatus}.{" "}
                    {email.manualStatusReason || "Status applied from this email."}
                  </p>
                ) : (
                  <p className="text-xs text-indigo-700 mt-2">
                    Detected by the AI email classifier. High-confidence
                    signals only automatically update your application when
                    tracking is enabled in Settings; otherwise you can approve
                    the change below.
                  </p>
                )}
              </div>
            )}

            <div className="bg-brand-50 border border-brand-200/70 rounded-2xl p-5 mb-4">
              <h3 className="text-sm font-semibold text-brand-900 mb-1">
                AI Suggested Status
              </h3>
              <p className="text-xs text-brand-700 mb-3">
                This is a suggestion only and never changes your application on
                its own.
              </p>
              <p className="text-sm text-brand-900 font-medium">
                {email.suggestedApplicationStatus || "No suggestion"}
              </p>
            </div>

            <div className="mb-4">
              <p className="field-label">
                Linked Application
              </p>
              <p className="text-sm text-slate-700">
                {email.application ? (
                  <>
                    Status:{" "}
                    <span className="font-medium">{email.application.status || "—"}</span>
                  </>
                ) : (
                  "This email is not linked to a tracked application."
                )}
              </p>
            </div>

            {!confirming ? (
              <div className="flex flex-wrap gap-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DetectedCareerStatus)}
                  className="select w-auto"
                >
                  {DETECTED_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!email.application || saving}
                  className="btn-primary"
                >
                  Update Application Status
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200/70 rounded-2xl p-5">
                <p className="text-sm text-amber-800 mb-3">
                  Confirm updating the linked application status to{" "}
                  <span className="font-semibold">{status}</span>. This change
                  will be applied to your application tracking.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={saving}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateStatus}
                    disabled={saving}
                    className="btn-primary"
                  >
                    {saving ? "Updating..." : "Confirm Update"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CareerEventActions({ event }: { event: CareerEvent }) {
  const [copied, setCopied] = useState(false);
  const [icsAdded, setIcsAdded] = useState(false);

  const handleCopyDraft = async () => {
    const draft = buildReplyDraft(event);
    if (!draft) return;
    const ok = await copyToClipboard(draft);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAddToCalendar = () => {
    const ics = buildInterviewIcs(event);
    if (!ics) return;
    downloadIcs(
      `${event.type || "career-event"}-${event.company || "event"}.ics`,
      ics
    );
    setIcsAdded(true);
    setTimeout(() => setIcsAdded(false), 2000);
  };

  if (!event.scheduledAt && !buildReplyDraft(event)) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {event.scheduledAt && (
        <button
          onClick={handleAddToCalendar}
          className="btn-sm text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors"
        >
          {icsAdded ? "Added ✓" : "Add to calendar"}
        </button>
      )}
      {buildReplyDraft(event) && (
        <button
          onClick={handleCopyDraft}
          className="btn-secondary btn-sm"
        >
          {copied ? "Copied ✓" : "Copy draft"}
        </button>
      )}
    </div>
  );
}

export default CareerEmails;
