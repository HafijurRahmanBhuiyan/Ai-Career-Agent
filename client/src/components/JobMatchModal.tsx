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
    <div className="modal-backdrop">
      <div className="modal-panel max-w-3xl">
        <div className="overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900">
                AI Job Match
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {jobMeta.title || jobTitle} · {jobMeta.companyName || jobCompany}
              </p>
              {match && (
                <p className="mt-1 text-xs text-slate-400">
                  Analyzed {formatAnalyzedDate(match.analyzedAt)}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="btn-ghost btn-sm shrink-0 text-lg text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="p-6">
          {error && <div className="alert-error mb-4">{error}</div>}
          {info && <div className="alert-warning mb-4">{info}</div>}
          {cached && match && (
            <div className="alert-info mb-4 px-3 py-2.5 text-xs">
              Showing cached analysis from a previous run.
            </div>
          )}

          {loading && !match && (
            <div className="py-16 text-center">
              <div className="spinner mb-4 h-8 w-8"></div>
              <p className="text-sm text-slate-500">Analyzing match...</p>
            </div>
          )}

          {!loading && !match && !error && (
            <div className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-lg font-bold text-white shadow-glow-primary">
                AI
              </div>
              <p className="mb-5 text-sm text-slate-500">
                Run an AI analysis to see how well this job matches your
                career profile.
              </p>
              <button
                onClick={() => runAnalysis(false)}
                className="btn-primary px-5 py-2.5"
              >
                Analyze Match
              </button>
            </div>
          )}

          {match && <MatchResult match={match} />}

          </div>
      </div>
      <div className="flex gap-3 border-t border-slate-200 bg-white px-6 py-4">
        {match ? (
          <>
            <button
              onClick={() => {
                setInfo(null);
                runAnalysis(false);
              }}
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? "Analyzing..." : "Refresh Analysis"}
            </button>
            <button
              onClick={() => {
                setInfo(null);
                runAnalysis(true);
              }}
              disabled={loading}
              className="btn-outline flex-1"
            >
              {loading ? "Reanalyzing..." : "Force Re-analysis"}
            </button>
          </>
        ) : (
          !loading && (
            <button onClick={onClose} className="btn-outline flex-1">
              Close
            </button>
          )
        )}
      </div>
    </div>
  </div>
  );
}

function MatchResult({ match }: { match: JobMatch }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-6 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-6 shadow-card">
        <div className="shrink-0 text-center">
          <div className={`text-6xl font-black leading-none tracking-tight tabular-nums ${scoreRingColor(match.score)}`}>
            {match.score}
            <span className="text-sm font-semibold text-slate-400">/100</span>
          </div>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Match Score
          </p>
        </div>
        <div className="min-w-0">
          <span
            className={`badge ${matchLevelBadgeClass(
              match.matchLevel
            )}`}
          >
            {matchLevelLabel[match.matchLevel] || match.matchLevel}
          </span>
          <p className="mt-2 text-sm text-slate-600">
            Recommendation:{" "}
            <span className="font-semibold text-slate-800">
              {recommendationLabel(match.recommendation)}
            </span>
          </p>
        </div>
      </div>

      <div className="mb-5">
        <h3 className="section-title mb-2">Summary</h3>
        <p className="text-sm leading-relaxed text-slate-700">
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

      <div className="mt-5 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50 p-5 shadow-card">
        <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-brand-800">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-500"></span>
          AI Recommendation
        </h3>
        <p className="text-sm leading-relaxed text-brand-900/90">{match.recommendationReason || match.recommendation}</p>
      </div>

      <p className="mt-5 text-xs text-slate-400">
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
      <h3 className="section-title mb-2">{title}</h3>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => (
            <span
              key={idx}
              className={`chip border ${
                muted
                  ? "border-red-100 bg-red-50 text-red-700"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700"
              }`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-slate-400">None identified.</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="card p-3.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700">
        {value || "Not assessed."}
      </p>
    </div>
  );
}
