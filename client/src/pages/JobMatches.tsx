import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { JobMatch } from "../types/jobMatch";
import {
  matchLevelLabel,
  matchLevelBadgeClass,
  formatAnalyzedDate,
  scoreColor,
} from "../utils/match";

const API_BASE = "http://localhost:5001/api";
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
        const res = await axios.get<{ matches: JobMatchListItem[]; pagination: Pagination }>(
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
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-200">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            AC
          </div>
          <span className="text-lg font-bold text-slate-900">Career Agent</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem label="Dashboard" />
          <NavItem label="GitHub Projects" />
          <NavItem label="Jobs" />
          <NavItem label="My Job Matches" active />
          <NavItem label="Applications" />
          <NavItem label="Emails" />
        </nav>
        <div className="px-3 py-4 border-t border-slate-200">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">My Job Matches</h1>
            <p className="text-slate-500 mt-1">
              AI-scored matches between your career profile and jobs you have analyzed
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-4">Dismiss</button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Min Score
                </label>
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  placeholder="e.g. 75"
                  min={0}
                  max={100}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Match Level
                </label>
                <select
                  value={matchLevel}
                  onChange={(e) => setMatchLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Any</option>
                  <option value="strong_match">Strong Match</option>
                  <option value="good_match">Good Match</option>
                  <option value="partial_match">Partial Match</option>
                  <option value="weak_match">Weak Match</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Sort By
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="newest">Newest Analysis</option>
                  <option value="score_desc">Score: High to Low</option>
                  <option value="score_asc">Score: Low to High</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleApplyFilters}
                  className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-500 text-sm">Loading matches...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
              <p className="text-slate-500 text-sm mb-1">No job matches yet.</p>
              <p className="text-slate-400 text-xs">
                Go to the Jobs page and click "Analyze Match" on a job to generate a match.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left text-xs">
                  <tr>
                    <th className="px-4 py-3">Job</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Match Level</th>
                    <th className="px-4 py-3">Analyzed</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matches.map((m) => (
                    <tr key={m._id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {m.job?.title || "Untitled Job"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {m.job?.companyName || ""}
                        </p>
                      </td>
                      <td className={`px-4 py-3 font-bold ${scoreColor(m.score)}`}>
                        {m.score}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${matchLevelBadgeClass(
                            m.matchLevel
                          )}`}
                        >
                          {matchLevelLabel[m.matchLevel] || m.matchLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatAnalyzedDate(m.analyzedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setViewing(m)}
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
              {pagination.total} match(es)
            </div>
          )}
        </div>
      </main>

      {viewing && (
        <MatchDetailModal match={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {match.job?.title || "Untitled Job"}
            </h2>
            <p className="text-sm text-slate-600 mt-1">{match.job?.companyName || ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-5 mb-6 p-4 bg-slate-50 rounded-xl">
            <div className={`text-5xl font-bold ${scoreColor(match.score)}`}>
              {match.score}
            </div>
            <div>
              <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${matchLevelBadgeClass(match.matchLevel)}`}>
                {matchLevelLabel[match.matchLevel] || match.matchLevel}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                Analyzed {formatAnalyzedDate(match.analyzedAt)}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed mb-5">
            {match.summary || "No summary."}
          </p>

          <Section title="Matching Skills" items={match.matchingSkills} />
          <Section title="Missing Skills" items={match.missingSkills} muted />
          <Section title="Matching Technologies" items={match.matchingTechnologies} />
          <Section title="Missing Technologies" items={match.missingTechnologies} muted />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <Field label="Experience Match" value={match.experienceMatch} />
            <Field label="Experience Gap" value={match.experienceGap} />
            <Field label="Education Match" value={match.educationMatch} />
            <Field label="Education Gap" value={match.educationGap} />
            <Field label="Remote Match" value={match.remoteMatch} />
            <Field label="Salary Match" value={match.salaryMatch} />
          </div>

          <Section title="Strengths" items={match.strengths} />
          <Section title="Weaknesses" items={match.weaknesses} muted />

          <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Recommendation</h3>
            <p className="text-sm text-blue-800">{match.recommendationReason || match.recommendation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, muted }: { title: string; items?: string[]; muted?: boolean }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => (
            <span key={idx} className={`text-xs px-2 py-1 rounded ${muted ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
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
    <div className="p-3 bg-slate-50 rounded-lg">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-700">{value || "Not assessed."}</p>
    </div>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
        active
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}

export default JobMatches;
