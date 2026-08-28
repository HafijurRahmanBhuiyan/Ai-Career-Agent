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

const PAGE_SIZE = 9;

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

  const handleTrack = async (opp: Opportunity) => {
    try {
      await api.post("/applications", { jobId: opp.job._id });
      setSelected(null);
      fetchFeed(pagination.page);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { response?: { status?: number } }).response?.status === 409
      ) {
        setSelected((prev) => (prev ? { ...prev, alreadyApplied: true } : prev));
      } else {
        const msg =
          typeof err === "object" &&
          err !== null &&
          (err as { response?: { data?: { error?: string } } }).response?.data
            ?.error;
        setError(msg || "Could not save this application.");
      }
    }
  };

  const profileIncomplete = !profileComplete.hasSkills || !profileComplete.hasExperience;

  return (
    <DashboardLayout active="Opportunities">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Career Opportunities
          </h1>
          <p className="text-slate-500 mt-1">
            Ranked against your profile with a deterministic match score
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

        {profileIncomplete && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
            Add skills and experience to your profile for more accurate match
            scores.
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <form
            onSubmit={handleSearch}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Keywords
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. React Developer"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Remote
              </label>
              <select
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Employment Type
              </label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Experience Level
              </label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="mt-4">
            <button
              onClick={() => {
                setShowFresh(true);
                fetchFeed(1);
              }}
              disabled={loading}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh Opportunities"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Computing matches...</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <p className="text-slate-400 text-sm mb-2">No matching opportunities.</p>
            <p className="text-slate-400 text-xs">
              Try adjusting your filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages} (
              {pagination.total} opportunities)
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
      </div>

      {selected && (
        <OpportunityDetail
          opp={selected}
          onClose={() => setSelected(null)}
          onTrack={() => handleTrack(selected)}
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
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-semibold text-slate-900">
          {opp.job.title}
        </h3>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${level.cls}`}
        >
          {opp.match.score}/100
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-2">{opp.job.companyName}</p>
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {opp.job.location && (
          <span className="text-slate-500">{opp.job.location}</span>
        )}
        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
          {opp.job.remoteType}
        </span>
        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
          {opp.job.employmentType}
        </span>
      </div>
      {opp.match.matchingSkills.length > 0 && (
        <p className="text-xs text-emerald-700 mb-2">
          Matches: {opp.match.matchingSkills.slice(0, 5).join(", ")}
        </p>
      )}
      <p className="text-xs text-slate-500 mb-3 flex-1 line-clamp-3">
        {opp.job.description}
      </p>
      <div className="space-y-2">
        <button
          onClick={onView}
          className="w-full px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          View &amp; Match Details
        </button>
      </div>
    </div>
  );
}

function OpportunityDetail({
  opp,
  onClose,
  onTrack,
}: {
  opp: Opportunity;
  onClose: () => void;
  onTrack: () => void;
}) {
  const level = MATCH_LEVEL_LABELS[opp.match.matchLevel] || MATCH_LEVEL_LABELS.weak_match;
  const rec = RECOMMENDATION_LABELS[opp.match.recommendation] || {
    label: "Consider",
    cls: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{opp.job.title}</h2>
            <p className="text-sm text-slate-600 mt-1">{opp.job.companyName}</p>
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
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            {opp.job.location && (
              <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
                {opp.job.location}
              </span>
            )}
            <span
              className={`px-2 py-1 font-medium rounded ${level.cls}`}
            >
              Match {opp.match.score}/100 · {level.label}
            </span>
            <span className={`px-2 py-1 font-medium rounded ${rec.cls}`}>
              {rec.label}
            </span>
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
              {opp.job.remoteType}
            </span>
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
              {opp.job.employmentType}
            </span>
            {opp.job.salaryMin != null && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">
                {formatSalary(opp.job)}
              </span>
            )}
          </div>

          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Why this matches
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {opp.match.explanation.map((line, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
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
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Skills to strengthen
              </h3>
              <div className="flex flex-wrap gap-2">
                {opp.match.missingSkills.map((s, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Description
            </h3>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {opp.job.description || "No description available."}
            </p>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
              Apply: {opp.applyCapability.label}
            </span>
            <span>Source: {opp.job.source}</span>
            {opp.job.postedAt && <span>Posted {formatDate(opp.job.postedAt)}</span>}
          </div>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={onTrack}
              disabled={opp.alreadyApplied}
              className="flex-1 px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {opp.alreadyApplied ? "Already tracked" : "Track / Save this job"}
            </button>
            {opp.applyCapability.handoffUrl && (
              <a
                href={opp.applyCapability.handoffUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors text-center"
              >
                Open application
              </a>
            )}
            {opp.applyCapability.capability === "manual_required" &&
              !opp.applyCapability.handoffUrl && (
                <span className="flex-1 px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg text-center">
                  Apply manually on the source site
                </span>
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
