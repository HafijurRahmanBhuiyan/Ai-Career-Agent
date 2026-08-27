import { useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import { JobMatch } from "../types/jobMatch";
import {
  matchLevelLabel,
  scoreRingColor,
  matchLevelBadgeClass,
  recommendationLabel,
  formatAnalyzedDate,
} from "../utils/match";

const API_BASE = "";

interface Props {
  jobId: string;
  jobTitle: string;
  jobCompany: string;
  onClose: () => void;
}

interface MatchJobMeta {
  title?: string;
  companyName?: string;
}

export default function JobMatchModal({
  jobId,
  jobTitle,
  jobCompany,
  onClose,
}: Props) {
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [jobMeta, setJobMeta] = useState<MatchJobMeta>({
    title: jobTitle,
    companyName: jobCompany,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const runAnalysis = async (reanalyze: boolean) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const url = `${API_BASE}/jobs/${jobId}/match${
        reanalyze ? "/reanalyze" : ""
      }`;
      const res = await api.post<{ match: JobMatch; job?: MatchJobMeta; cached?: boolean }>(
        url
      );
      setMatch(res.data.match);
      if (res.data.cached) {
        setCached(true);
      } else {
        setCached(false);
      }
      if (res.data.job) setJobMeta(res.data.job);
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Match analysis failed";
      setError(msg);
      setInfo(
        "Add skills, experience, education, and projects to your profile for a more accurate match."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadExisting = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ match: JobMatch; job?: MatchJobMeta }>(
        `${API_BASE}/jobs/${jobId}/match`
      );
      setMatch(res.data.match);
      if (res.data.job) setJobMeta(res.data.job);
    } catch {
      setMatch(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    loadExisting();
  };

  useEffect(() => {
    handleOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              AI Job Match
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {jobMeta.title || jobTitle} · {jobMeta.companyName || jobCompany}
            </p>
            {match && (
              <p className="text-xs text-slate-400 mt-1">
                Analyzed {formatAnalyzedDate(match.analyzedAt)}
              </p>
            )}
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
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
              {info}
            </div>
          )}
          {cached && match && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs">
              Showing cached analysis from a previous run.
            </div>
          )}

          {loading && !match && (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-500 text-sm">Analyzing match...</p>
            </div>
          )}

          {!loading && !match && !error && (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4 text-sm">
                Run an AI analysis to see how well this job matches your
                career profile.
              </p>
              <button
                onClick={() => runAnalysis(false)}
                className="px-5 py-2.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Analyze Match
              </button>
            </div>
          )}

          {match && <MatchResult match={match} />}

          <div className="flex gap-3 mt-6">
            {match ? (
              <>
                <button
                  onClick={() => {
                    setInfo(null);
                    runAnalysis(false);
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? "Analyzing..." : "Refresh Analysis"}
                </button>
                <button
                  onClick={() => {
                    setInfo(null);
                    runAnalysis(true);
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {loading ? "Reanalyzing..." : "Force Re-analysis"}
                </button>
              </>
            ) : (
              !loading && (
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchResult({ match }: { match: JobMatch }) {
  return (
    <div>
      <div className="flex items-center gap-5 mb-6 p-4 bg-slate-50 rounded-xl">
        <div className={`text-5xl font-bold ${scoreRingColor(match.score)}`}>
          {match.score}
        </div>
        <div>
          <span
            className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${matchLevelBadgeClass(
              match.matchLevel
            )}`}
          >
            {matchLevelLabel[match.matchLevel] || match.matchLevel}
          </span>
          <p className="text-xs text-slate-500 mt-1">
            Recommendation:{" "}
            <span className="font-medium text-slate-700">
              {recommendationLabel(match.recommendation)}
            </span>
          </p>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Summary</h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          {match.summary || "No summary provided."}
        </p>
      </div>

      <InfoSection title="Matching Skills" items={match.matchingSkills} />
      <InfoSection title="Missing Skills" items={match.missingSkills} muted />
      <InfoSection title="Matching Technologies" items={match.matchingTechnologies} />
      <InfoSection title="Missing Technologies" items={match.missingTechnologies} muted />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <Field label="Experience Match" value={match.experienceMatch} />
        <Field label="Experience Gap" value={match.experienceGap} />
        <Field label="Education Match" value={match.educationMatch} />
        <Field label="Education Gap" value={match.educationGap} />
        <Field label="Location Match" value={match.locationMatch} />
        <Field label="Remote Match" value={match.remoteMatch} />
        <Field label="Employment Type Match" value={match.employmentTypeMatch} />
        <Field label="Salary Match" value={match.salaryMatch} />
      </div>

      <InfoSection title="Strengths" items={match.strengths} />
      <InfoSection title="Weaknesses" items={match.weaknesses} muted />

      <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-sm font-semibold text-blue-900 mb-1">
          Recommendation
        </h3>
        <p className="text-sm text-blue-800">{match.recommendationReason || match.recommendation}</p>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        This match score is an objective estimate of skill/experience alignment. A high
        score does not guarantee an interview or job.
      </p>
    </div>
  );
}

function InfoSection({
  title,
  items,
  muted,
}: {
  title: string;
  items?: string[];
  muted?: boolean;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => (
            <span
              key={idx}
              className={`text-xs px-2 py-1 rounded ${
                muted
                  ? "bg-red-50 text-red-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
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
    <div className="p-3 bg-slate-50 rounded-lg">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-700">
        {value || "Not assessed."}
      </p>
    </div>
  );
}
