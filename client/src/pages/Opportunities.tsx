import { useEffect, useState, useCallback, FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import {
  Opportunity,
  OpportunityFeedResponse,
  OpportunityJob,
  MatchLevel,
} from "../types/opportunity";
import type { ApplicationStatus } from "../types/application";
import {
  applyFromOpportunity,
  confirmApplication,
  saveApplication,
} from "../services/applications";
import { validateHandoffUrl } from "../utils/handoffUrl";
import { getErrorMessage } from "../utils/apiError";

const PAGE_SIZE = 9;

const APPLICATION_STATUS_LABELS: Record<
  ApplicationStatus,
  { label: string; cls: string }
> = {
  saved: { label: "Saved", cls: "bg-slate-100 text-slate-700" },
  applied: { label: "Applied", cls: "bg-emerald-50 text-emerald-700" },
  screening: { label: "Screening", cls: "bg-blue-50 text-blue-700" },
  interview: { label: "Interview", cls: "bg-violet-50 text-violet-700" },
  offer: { label: "Offer", cls: "bg-amber-50 text-amber-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700" },
  withdrawn: { label: "Withdrawn", cls: "bg-slate-100 text-slate-500" },
};

const MATCH_LEVEL_LABELS: Record<MatchLevel, { label: string; cls: string }> = {
  strong_match: { label: "Strong match", cls: "bg-emerald-50 text-emerald-700" },
  good_match: { label: "Good match", cls: "bg-blue-50 text-blue-700" },
  partial_match: { label: "Partial match", cls: "bg-amber-50 text-amber-700" },
  weak_match: { label: "Weak match", cls: "bg-slate-100 text-slate-600" },
};

const RECOMMENDATION_LABELS: Record<string, { label: string; cls: string }> = {
  apply: { label: "Apply", cls: "bg-emerald-50 text-emerald-700" },
  maybe: { label: "Consider", cls: "bg-amber-50 text-amber-700" },
  skip: { label: "Low fit", cls: "bg-slate-100 text-slate-600" },
};

function openValidatedUrl(
  value: string | null | undefined,
  onInvalid: () => void
): void {
  const url = validateHandoffUrl(value);
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    onInvalid();
  }
}

function Opportunities() {
  const [keywords, setKeywords] = useState("");
  const [remote, setRemote] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [profileComplete, setProfileComplete] = useState({
    hasSkills: false,
    hasExperience: false,
    hasProfile: false,
  });
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [showFresh, setShowFresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (keywords.trim()) params.set("keywords", keywords.trim());
      if (remote) params.set("remote", remote);
      if (employmentType) params.set("employmentType", employmentType);
      if (experienceLevel) params.set("experienceLevel", experienceLevel);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      return params.toString();
    },
    [keywords, remote, employmentType, experienceLevel]
  );

  const fetchFeed = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<OpportunityFeedResponse>(
          `/jobs/opportunities?${buildQuery(page)}`
        );
        setOpportunities(res.data.opportunities);
        setPagination(res.data.pagination);
        setProfileComplete(res.data.profileComplete);
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.error
            ? err.response.data.error
            : "Failed to load opportunities";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    if (!showFresh) return;
    fetchFeed(1);
  }, [showFresh, fetchFeed]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setShowFresh(true);
    fetchFeed(1);
  };

  const handlePageChange = (page: number) => {
    fetchFeed(page);
  };

  const updateOppState = (next: Opportunity) => {
    setOpportunities((prev) =>
      prev.map((o) => (o.job._id === next.job._id ? next : o))
    );
    setSelected((prev) =>
      prev && prev.job._id === next.job._id ? next : prev
    );
  };

  const profileIncomplete = !profileComplete.hasSkills || !profileComplete.hasExperience;

  return (
    <DashboardLayout active="Opportunities">
      <div className="max-w-7xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-glow-primary">
                💼
              </span>
              Career Opportunities
            </h1>
            <p className="page-subtitle">
              Ranked against your profile with a deterministic match score
            </p>
          </div>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="shrink-0 text-xs font-semibold uppercase tracking-wide text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {profileIncomplete && (
          <div className="alert-info mb-6">
            <span>
              Add skills and experience to your profile for more accurate match
              scores.
            </span>
          </div>
        )}

        <div className="card p-5 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Filters</h2>
            <span className="badge bg-brand-50 text-brand-700">
              Find your next move
            </span>
          </div>
          <form
            onSubmit={handleSearch}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div>
              <label className="field-label">Keywords</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. React Developer"
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Remote</label>
              <select
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
                className="select"
              >
                <option value="">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div>
              <label className="field-label">Employment Type</label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className="select"
              >
                <option value="">Any</option>
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>
            <div>
              <label className="field-label">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="select"
              >
                <option value="">Any</option>
                <option value="entry">Entry</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </form>
          <div className="mt-5 border-t border-slate-100 pt-4 flex justify-end">
            <button
              onClick={() => {
                setShowFresh(true);
                fetchFeed(1);
              }}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Loading..." : "Refresh Opportunities"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="spinner h-9 w-9 mb-4"></div>
            <p className="text-sm text-slate-500">Computing matches...</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="empty-state">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm font-medium text-slate-700 mb-1">
              No matching opportunities.
            </p>
            <p className="text-xs text-slate-400">
              Try adjusting your filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.job._id}
                opp={opp}
                onView={() => setSelected(opp)}
              />
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="btn-outline btn-sm"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500 tabular-nums">
              Page {pagination.page} of {pagination.totalPages} (
              {pagination.total} opportunities)
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
      </div>

      {selected && (
        <OpportunityDetail
          opp={selected}
          onClose={() => setSelected(null)}
          onStateChanged={updateOppState}
        />
      )}
    </DashboardLayout>
  );
}

function OpportunityCard({
  opp,
  onView,
}: {
  opp: Opportunity;
  onView: () => void;
}) {
  const level = MATCH_LEVEL_LABELS[opp.match.matchLevel] || MATCH_LEVEL_LABELS.weak_match;
  const rec = RECOMMENDATION_LABELS[opp.match.recommendation] || {
    label: "Consider",
    cls: "bg-amber-50 text-amber-700",
  };
  const statusInfo = opp.applicationStatus
    ? APPLICATION_STATUS_LABELS[opp.applicationStatus]
    : null;
  const hasSalary =
    opp.job.salaryMin != null || opp.job.salaryMax != null;
  const viewJobUrl = validateHandoffUrl(opp.applyCapability.handoffUrl);

  const primaryLabel = statusInfo
    ? statusInfo.label
    : "Apply";

  return (
    <div className="card-hover p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-slate-900 line-clamp-1">
          {opp.job.title}
        </h3>
        <span
          className={`badge shrink-0 ${level.cls} ring-1 ring-slate-900/5 ring-inset`}
        >
          {opp.match.score}/100
        </span>
      </div>
      <p className="text-sm font-medium text-slate-600 mb-3">
        {opp.job.companyName}
      </p>
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {opp.job.location && (
          <span className="chip bg-slate-100 text-slate-600">
            📍 {opp.job.location}
          </span>
        )}
        <span className="chip bg-brand-50 text-brand-700">{opp.job.remoteType}</span>
        <span className="chip bg-violet-50 text-violet-700">
          {opp.job.employmentType}
        </span>
        {hasSalary && (
          <span className="chip bg-amber-50 text-amber-700">
            {formatSalary(opp.job)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className={`badge ${rec.cls}`}>{rec.label}</span>
        {opp.applicationStatus !== null && statusInfo ? (
          <span className={`badge ${statusInfo.cls}`}>
            {statusInfo.label}
          </span>
        ) : (
          <span className="badge bg-slate-50 text-slate-500 border border-slate-200">
            Not applied
          </span>
        )}
        {opp.match.salaryMatch && (
          <span className="chip bg-slate-100 text-slate-600">
            Salary: {opp.match.salaryMatch}
          </span>
        )}
        {opp.match.educationMatch && (
          <span className="chip bg-slate-100 text-slate-600">
            Education: {opp.match.educationMatch}
          </span>
        )}
      </div>
      {opp.match.matchingSkills.length > 0 && (
        <p className="text-xs text-emerald-700 mb-2">
          <span className="font-semibold">Matches:</span>{" "}
          {opp.match.matchingSkills.slice(0, 5).join(", ")}
        </p>
      )}
      {opp.match.missingSkills.length > 0 && (
        <p className="text-xs text-amber-700 mb-2">
          <span className="font-semibold">Gaps:</span>{" "}
          {opp.match.missingSkills.slice(0, 4).join(", ")}
        </p>
      )}
      <p className="text-xs text-slate-500 mb-4 flex-1 leading-relaxed line-clamp-3">
        {opp.job.description}
      </p>
      <div className="flex gap-2.5 mt-auto">
        <button
          onClick={onView}
          className={`flex-1 btn ${
            opp.applicationStatus === null || opp.applicationStatus === "saved"
              ? "btn-primary"
              : `${statusInfo?.cls ?? "bg-slate-100 text-slate-600"}`
          }`}
        >
          {primaryLabel}
        </button>
        {viewJobUrl && (
          <a
            href={viewJobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline text-center"
          >
            View Job
          </a>
        )}
      </div>
    </div>
  );
}

function OpportunityDetail({
  opp,
  onClose,
  onStateChanged,
}: {
  opp: Opportunity;
  onClose: () => void;
  onStateChanged: (next: Opportunity) => void;
}) {
  const level = MATCH_LEVEL_LABELS[opp.match.matchLevel] || MATCH_LEVEL_LABELS.weak_match;
  const rec = RECOMMENDATION_LABELS[opp.match.recommendation] || {
    label: "Consider",
    cls: "bg-amber-50 text-amber-700",
  };
  const status = opp.applicationStatus;
  const statusInfo = status ? APPLICATION_STATUS_LABELS[status] : null;

  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);

  const viewJobUrl = validateHandoffUrl(opp.applyCapability.handoffUrl);
  const canTrack = status === null || status === "saved";

  const markStatus = (nextStatus: ApplicationStatus) => {
    onStateChanged({
      ...opp,
      applicationStatus: nextStatus,
      alreadyApplied: nextStatus !== null,
    });
  };

  const handleSave = async () => {
    setActionError(null);
    setConfirmMessage(null);
    setSaving(true);
    try {
      const res = await saveApplication(opp.job._id);
      setAppId(res.application._id);
      markStatus(res.application.status);
      setConfirmMessage("Job saved. You can apply when you are ready.");
    } catch (err: unknown) {
      const statusCode =
        typeof err === "object" &&
        err !== null &&
        (err as { response?: { status?: number } }).response?.status;
      if (statusCode === 409) {
        markStatus("saved");
        setConfirmMessage("You are already tracking this job as Saved.");
      } else {
        setActionError(getErrorMessage(err, "Could not save this job."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    setActionError(null);
    setConfirmMessage(null);
    setApplying(true);
    try {
      const info = await applyFromOpportunity(opp.job._id);
      setAppId(info.application.id);
      markStatus(info.application.status as ApplicationStatus);

      const url = validateHandoffUrl(info.capabilityInfo.handoffUrl);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setConfirmMessage("The external application page opened in a new tab.");
      } else {
        setActionError(
          "No external application URL is available for this job. You can still track it here."
        );
      }
      setConfirmPrompt(true);
    } catch (err: unknown) {
      setActionError(
        getErrorMessage(err, "Could not prepare the application. Please try again.")
      );
    } finally {
      setApplying(false);
    }
  };

  const handleConfirmSubmitted = async () => {
    if (!appId) return;
    setActionError(null);
    setConfirming(true);
    try {
      await confirmApplication(appId);
      markStatus("applied");
      setConfirmMessage("Application marked as submitted.");
      setConfirmPrompt(false);
    } catch (err: unknown) {
      setActionError(
        getErrorMessage(err, "Could not mark the application as submitted.")
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleViewJob = () => {
    openValidatedUrl(
      opp.applyCapability.handoffUrl,
      () => setActionError("No valid external job link is available for this role.")
    );
  };

  return (
    <div className="modal-backdrop">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-900 line-clamp-1">
              {opp.job.title}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {opp.job.companyName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap gap-2 mb-5">
            {opp.job.location && (
              <span className="chip bg-slate-100 text-slate-700">
                📍 {opp.job.location}
              </span>
            )}
            <span className={`chip font-semibold ${level.cls}`}>
              Match {opp.match.score}/100 · {level.label}
            </span>
            <span className={`chip font-semibold ${rec.cls}`}>
              {rec.label}
            </span>
            <span className="chip bg-brand-50 text-brand-700">
              {opp.job.remoteType}
            </span>
            <span className="chip bg-violet-50 text-violet-700">
              {opp.job.employmentType}
            </span>
            {opp.job.salaryMin != null && (
              <span className="chip bg-amber-50 text-amber-700">
                {formatSalary(opp.job)}
              </span>
            )}
            {opp.applicationStatus !== null && statusInfo ? (
              <span className={`chip font-semibold ${statusInfo.cls}`}>
                {statusInfo.label}
              </span>
            ) : (
              <span className="chip bg-slate-50 text-slate-500 border border-slate-200">
                Not applied
              </span>
            )}
            {opp.match.salaryMatch && (
              <span className="chip bg-slate-100 text-slate-600">
                Salary match: {opp.match.salaryMatch}
              </span>
            )}
            {opp.match.educationMatch && (
              <span className="chip bg-slate-100 text-slate-600">
                Education match: {opp.match.educationMatch}
              </span>
            )}
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-violet-600 text-white text-xs shadow-glow-primary">
                ✓
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Why this matches
              </h3>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {opp.match.explanation.map((line, idx) => (
                <li key={idx} className="flex gap-2.5">
                  <span className="text-brand-400 mt-0.5">•</span>
                  <span className="flex-1">{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              {opp.match.recommendationReason}
            </p>
          </div>

          {opp.match.missingSkills.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-xs">
                  ↑
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  Skills to strengthen
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {opp.match.missingSkills.map((s, idx) => (
                  <span
                    key={idx}
                    className="chip bg-amber-50 text-amber-700 border border-amber-100"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-600 text-xs">
                📄
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Description
              </h3>
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
              {opp.job.description || "No description available."}
            </p>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="chip bg-slate-100 text-slate-700">
              Apply: {opp.applyCapability.label}
            </span>
            <span>Source: {opp.job.source}</span>
            {opp.job.postedAt && <span>Posted {formatDate(opp.job.postedAt)}</span>}
          </div>

          {actionError && (
            <div className="alert-error mb-4">
              <span>{actionError}</span>
            </div>
          )}
          {confirmMessage && (
            <div className="alert-success mb-4">
              <span>{confirmMessage}</span>
            </div>
          )}

          {confirmPrompt && (
            <div className="mb-4 p-4 bg-brand-50 border border-brand-200 rounded-xl">
              <p className="text-sm text-brand-900">
                After applying on the external site, confirm here to record it.
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <button
                  onClick={handleConfirmSubmitted}
                  disabled={confirming}
                  className="btn btn-primary"
                >
                  {confirming ? "Confirming..." : "I submitted"}
                </button>
                <button
                  onClick={() => {
                    setConfirmPrompt(false);
                    setConfirmMessage("Noted. Your application stays as Saved.");
                  }}
                  disabled={confirming}
                  className="btn btn-outline"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-6">
            {status === null && (
              <button
                onClick={handleSave}
                disabled={saving || applying}
                className="flex-1 btn-secondary"
              >
                {saving ? "Saving..." : "Save this job"}
              </button>
            )}
            {canTrack && (
              <button
                onClick={handleApply}
                disabled={applying || saving}
                className="flex-1 btn-primary"
              >
                {applying ? "Preparing..." : "Apply"}
              </button>
            )}
            {!canTrack && statusInfo && (
              <span
                className={`flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl ${statusInfo.cls}`}
              >
                {statusInfo.label}
              </span>
            )}
            {viewJobUrl && (
              <button
                onClick={handleViewJob}
                className="flex-1 btn-outline"
              >
                View Job
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSalary(job: OpportunityJob): string {
  if (job.salaryMin == null && job.salaryMax == null) return "Salary N/A";
  const cur = job.salaryCurrency ? `${job.salaryCurrency} ` : "";
  if (job.salaryMin != null && job.salaryMax != null) {
    return `${cur}${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()}`;
  }
  if (job.salaryMin != null) return `${cur}${job.salaryMin.toLocaleString()}+`;
  return `${cur}${job.salaryMax!.toLocaleString()}`;
}

function formatDate(date?: string | null): string {
  if (!date) return "Unknown";
  return new Date(date).toLocaleDateString();
}

export default Opportunities;
