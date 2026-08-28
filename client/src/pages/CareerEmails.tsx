import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import {
  ApplicationStatus,
  CareerEmail,
  CareerEmailCategory,
  CareerEmailLinkedApplication,
  CareerEmailPagination,
} from "../types/careerEmail";
import { getErrorMessage } from "../utils/apiError";

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

function CareerEmails() {
  const [emails, setEmails] = useState<CareerEmail[]>([]);
  const [pagination, setPagination] = useState<CareerEmailPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [categoryFilter, setCategoryFilter] = useState<CareerEmailCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<CareerEmail | null>(null);

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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Career Emails</h1>
          <p className="text-slate-500 mt-1">
            AI-classified emails from your Gmail, with suggested application
            status updates you can review and approve
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
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as CareerEmailCategory | "")
                }
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Suggested Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as ApplicationStatus | "")
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
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Sort
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <button
              onClick={handleFilter}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply Filter
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Emails are synced from your connected Gmail account on the
            Integrations page. AI suggestions never change your application
            status automatically.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Loading career emails...</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <p className="text-slate-500 text-sm mb-1">No career emails yet.</p>
            <p className="text-slate-400 text-xs mb-4">
              Connect your Gmail account and run a sync to classify incoming
              career emails.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Suggested Status</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emails.map((email) => (
                  <tr key={email.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 truncate max-w-xs">
                        {email.subject || "(no subject)"}
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-xs">
                        {email.from || ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {email.companyName || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {email.jobTitle || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                          email.category
                            ? CATEGORY_STYLES[email.category]
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {formatCategory(email.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {email.suggestedApplicationStatus ? (
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                          {email.suggestedApplicationStatus}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {formatDate(email.receivedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setViewing(email)}
                        className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        View
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
  const [status, setStatus] = useState<ApplicationStatus>(
    email.suggestedApplicationStatus || "applied"
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
      <dt className="text-xs font-medium text-slate-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-900">{value || "—"}</dd>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {email.subject || "(no subject)"}
            </h2>
            <p className="text-sm text-slate-600 mt-1">{email.from || ""}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl"
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

          {email.category && (
            <span
              className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mb-4 ${CATEGORY_STYLES[email.category]}`}
            >
              {formatCategory(email.category)}
            </span>
          )}

          <dl className="grid grid-cols-2 gap-4 mb-6">
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

          {email.summary && (
            <div className="mb-6">
              <p className="text-xs font-medium text-slate-500 mb-1">AI Summary</p>
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {email.summary}
              </p>
            </div>
          )}

          {email.snippet && (
            <div className="mb-6">
              <p className="text-xs font-medium text-slate-500 mb-1">Excerpt</p>
              <p className="text-sm text-slate-600">{email.snippet}</p>
            </div>
          )}

          {email.confidence != null && (
            <p className="text-xs text-slate-400 mb-6">
              Classification confidence: {Math.round(email.confidence * 100)}%
            </p>
          )}

          <div className="border-t border-slate-200 pt-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                AI Suggested Status
              </h3>
              <p className="text-xs text-blue-700 mb-3">
                This is a suggestion only. Your application status is never
                changed unless you explicitly confirm the update below.
              </p>
              <p className="text-sm text-blue-900 font-medium">
                {email.suggestedApplicationStatus || "No suggestion"}
              </p>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 mb-1">
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
              <div className="flex gap-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.slice(1).map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!email.application || saving}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Update Application Status
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800 mb-3">
                  Confirm updating the linked application status to{" "}
                  <span className="font-semibold">{status}</span>. This change
                  will be applied to your application tracking.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={saving}
                    className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateStatus}
                    disabled={saving}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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

export default CareerEmails;
