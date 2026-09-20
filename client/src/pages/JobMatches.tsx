import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { JobMatch } from "../types/jobMatch";
import {
  matchLevelLabel,
  matchLevelBadgeClass,
  formatAnalyzedDate,
  scoreColor,
} from "../utils/match";

const API_BASE = "";
const PAGE_SIZE = 10;

interface JobMatchListItem extends JobMatch {}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function JobMatches() {
  const [matches, setMatches] = useState<JobMatchListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [minScore, setMinScore] = useState("");
  const [matchLevel, setMatchLevel] = useState("");
  const [sort, setSort] = useState("newest");
  const [viewing, setViewing] = useState<JobMatchListItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (minScore) params.set("minScore", minScore);
      if (matchLevel) params.set("matchLevel", matchLevel);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      return params.toString();
    },
    [minScore, matchLevel, sort]
  );

  const fetchMatches = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ matches: JobMatchListItem[]; pagination: Pagination }>(
          `${API_BASE}/job-matches?${buildQuery(page)}`
        );
        setMatches(res.data.matches);
        setPagination(res.data.pagination);
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.error
            ? err.response.data.error
            : "Failed to load matches";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    fetchMatches(1);
  }, [fetchMatches]);

  const handleApplyFilters = () => {
    fetchMatches(1);
  };

  const handlePageChange = (page: number) => {
    fetchMatches(page);
  };

  return (
    <DashboardLayout active="My Job Matches">
      <div className="max-w-5xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">My Job Matches</h1>
            <p className="page-subtitle">
              AI-scored matches between your career profile and jobs you have analyzed
            </p>
          </div>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="btn-ghost btn-sm shrink-0">
              Dismiss
            </button>
          </div>
        )}

        <div className="card p-5 sm:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="field-label">Min Score</label>
              <input
                type="number"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                placeholder="e.g. 75"
                min={0}
                max={100}
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Match Level</label>
              <select
                value={matchLevel}
                onChange={(e) => setMatchLevel(e.target.value)}
                className="select"
              >
                <option value="">Any</option>
                <option value="strong_match">Strong Match</option>
                <option value="good_match">Good Match</option>
                <option value="partial_match">Partial Match</option>
                <option value="weak_match">Weak Match</option>
              </select>
            </div>
            <div>
              <label className="field-label">Sort By</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="select"
              >
                <option value="newest">Newest Analysis</option>
                <option value="score_desc">Score: High to Low</option>
                <option value="score_asc">Score: Low to High</option>
              </select>
            </div>
            <div>
              <button onClick={handleApplyFilters} className="btn-primary w-full md:px-8">
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="spinner h-9 w-9 mb-4"></div>
            <p className="text-sm text-slate-500">Loading matches...</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="empty-state">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                />
              </svg>
            </div>
            <p className="font-semibold text-slate-800">No job matches yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Go to the Jobs page and click "Analyze Match" on a job to generate a match.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="th">Job</th>
                    <th className="th">Score</th>
                    <th className="th">Match Level</th>
                    <th className="th">Analyzed</th>
                    <th className="th text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matches.map((m) => (
                    <tr key={m._id} className="group transition-colors hover:bg-brand-50/40">
                      <td className="td">
                        <p className="font-semibold text-slate-900">
                          {m.job?.title || "Untitled Job"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {m.job?.companyName || ""}
                        </p>
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className={`text-lg font-bold tabular-nums ${scoreColor(m.score)}`}>
                          {m.score}
                        </span>
                        <span className="text-xs text-slate-400">/100</span>
                      </td>
                      <td className="td">
                        <span
                          className={`badge ${matchLevelBadgeClass(
                            m.matchLevel
                          )}`}
                        >
                          {matchLevelLabel[m.matchLevel] || m.matchLevel}
                        </span>
                      </td>
                      <td className="td text-xs text-slate-500 whitespace-nowrap">
                        {formatAnalyzedDate(m.analyzedAt)}
                      </td>
                      <td className="td text-right">
                        <button
                          onClick={() => setViewing(m)}
                          className="btn-outline btn-sm"
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
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="btn-outline btn-sm"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500 tabular-nums">
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
          <div className="text-center mt-5">
            <span className="badge bg-slate-100 text-slate-500">
              {pagination.total} match(es)
            </span>
          </div>
        )}
      </div>

      {viewing && (
        <MatchDetailModal match={viewing} onClose={() => setViewing(null)} />
      )}
    </DashboardLayout>
  );
}

function MatchDetailModal({
  match,
  onClose,
}: {
  match: JobMatchListItem;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-3xl">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">
              {match.job?.title || "Untitled Job"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">{match.job?.companyName || ""}</p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost btn-sm shrink-0 text-lg text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto">
          <div className="px-6 py-6">
            <div className="flex items-center gap-6 rounded-2xl bg-slate-50 p-6 mb-6">
              <div className={`text-6xl font-black tracking-tight tabular-nums ${scoreColor(match.score)}`}>
                {match.score}
                <span className="text-sm font-medium text-slate-400">/100</span>
              </div>
              <div>
                <span className={`badge ${matchLevelBadgeClass(match.matchLevel)}`}>
                  {matchLevelLabel[match.matchLevel] || match.matchLevel}
                </span>
                <p className="mt-1.5 text-xs text-slate-500">
                  Analyzed {formatAnalyzedDate(match.analyzedAt)}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed mb-6">
              {match.summary || "No summary."}
            </p>

            <Section title="Matching Skills" items={match.matchingSkills} />
            <Section title="Missing Skills" items={match.missingSkills} muted />
            <Section title="Matching Technologies" items={match.matchingTechnologies} />
            <Section title="Missing Technologies" items={match.missingTechnologies} muted />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Field label="Experience Match" value={match.experienceMatch} />
              <Field label="Experience Gap" value={match.experienceGap} />
              <Field label="Education Match" value={match.educationMatch} />
              <Field label="Education Gap" value={match.educationGap} />
              <Field label="Remote Match" value={match.remoteMatch} />
              <Field label="Salary Match" value={match.salaryMatch} />
            </div>

            <Section title="Strengths" items={match.strengths} />
            <Section title="Weaknesses" items={match.weaknesses} muted />

            <div className="alert-info mt-6">
              <div>
                <h3 className="font-semibold text-brand-900">Recommendation</h3>
                <p className="mt-0.5 text-brand-800">{match.recommendationReason || match.recommendation}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, muted }: { title: string; items?: string[]; muted?: boolean }) {
  return (
    <div className="mb-5">
      <h3 className="section-title mb-2.5">{title}</h3>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => (
            <span
              key={idx}
              className={`chip ${muted ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">None identified.</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-800">{value || "Not assessed."}</p>
    </div>
  );
}

export default JobMatches;