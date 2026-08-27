import { useEffect, useState, useCallback, FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import JobMatchModal from "../components/JobMatchModal";

interface Job {
  _id: string;
  source: string;
  sourceJobId: string;
  title: string;
  companyName: string;
  companyLogo?: string | null;
  description: string;
  location?: string | null;
  locations: string[];
  remoteType: string;
  employmentType: string;
  experienceLevel: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  skills: string[];
  technologies: string[];
  jobUrl?: string | null;
  applyUrl?: string | null;
  postedAt?: string | null;
  expiresAt?: string | null;
  discoveredAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SourceReport {
  source: string;
  status: "success" | "error";
  count?: number;
  message?: string;
}

const API_BASE = "";
const PAGE_SIZE = 9;

function Jobs() {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [sinceLastSearch, setSinceLastSearch] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [matchJob, setMatchJob] = useState<Job | null>(null);
  const [trackMsg, setTrackMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveryMsg, setDiscoveryMsg] = useState<string | null>(null);

  const buildQuery = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (keywords.trim()) params.set("keywords", keywords.trim());
      if (location.trim()) params.set("location", location.trim());
      if (remote) params.set("remote", remote);
      if (employmentType) params.set("employmentType", employmentType);
      if (experienceLevel) params.set("experienceLevel", experienceLevel);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      return params.toString();
    },
    [keywords, location, remote, employmentType, experienceLevel]
  );

  const fetchJobs = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const res = await api.get<{ jobs: Job[]; pagination: Pagination }>(
          `${API_BASE}/jobs?${buildQuery(page)}`
        );
        setJobs(res.data.jobs);
        setPagination(res.data.pagination);
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.error
            ? err.response.data.error
            : "Failed to load jobs";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    if (!sinceLastSearch) return;
    fetchJobs(1);
  }, [sinceLastSearch, fetchJobs]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSinceLastSearch(true);
    fetchJobs(1);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    setDiscoveryMsg(null);
    try {
      const res = await api.post<{
        jobs: Job[];
        count: number;
        sources: SourceReport[];
      }>(`${API_BASE}/jobs/discover`, {
        keywords: keywords.trim() || undefined,
        locations: location.trim() ? [location.trim()] : undefined,
        remote: remote || undefined,
        employmentType: employmentType || undefined,
        experienceLevel: experienceLevel || undefined,
      });

      const successful = res.data.sources.filter((s) => s.status === "success");
      const failed = res.data.sources.filter((s) => s.status === "error");

      if (res.data.count > 0) {
        setDiscoveryMsg(
          `Discovered ${res.data.count} job(s) from ${successful.length} source(s).`
        );
      } else {
        setDiscoveryMsg("Discovery complete — no new jobs found.");
      }

      if (failed.length > 0) {
        setError(
          `${failed.length} source(s) failed. Showing available results.`
        );
      }

      setJobs(res.data.jobs);
      setPagination({
        page: 1,
        limit: PAGE_SIZE,
        total: res.data.count,
        totalPages: Math.max(1, Math.ceil(res.data.count / PAGE_SIZE)),
      });
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Discovery failed";
      setError(msg);
    } finally {
      setDiscovering(false);
    }
  };

  const handlePageChange = (page: number) => {
    setError(null);
    fetchJobs(page);
  };

  const handleViewJob = (job: Job) => {
    setSelectedJob(job);
    setTrackMsg(null);
  };

  const handleAnalyzeMatch = (job: Job) => {
    setMatchJob(job);
  };

  const handleApply = (job: Job) => {
    if (job.applyUrl) window.open(job.applyUrl, "_blank", "noopener,noreferrer");
  };

  const handleTrackApplication = async (job: Job) => {
    setTrackMsg(null);
    try {
      await api.post(`${API_BASE}/applications`, { jobId: job._id });
      setTrackMsg("Application saved. Update its status from My Applications.");
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { response?: { status?: number } }).response?.status === 409
      ) {
        setTrackMsg("You are already tracking this job.");
      } else {
        const msg =
          typeof err === "object" &&
          err !== null &&
          (err as { response?: { data?: { error?: string } } }).response?.data
            ?.error;
        setTrackMsg(msg || "Could not save this application. Please try again.");
      }
    }
  };

  return (
    <DashboardLayout active="Jobs">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Job Discovery</h1>
            <p className="text-slate-500 mt-1">
              Discover and browse jobs from connected job sources
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

          {discoveryMsg && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center justify-between">
              <span>{discoveryMsg}</span>
              <button onClick={() => setDiscoveryMsg(null)} className="text-green-500 hover:text-green-700 ml-4">
                Dismiss
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Remote"
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
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Searching..." : "Search Jobs"}
              </button>
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="px-4 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {discovering ? "Discovering..." : "Discover Jobs"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-500 text-sm">Loading jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
              <p className="text-slate-400 text-sm mb-2">No jobs found.</p>
              <p className="text-slate-400 text-xs">
                Try adjusting your filters or click "Discover Jobs" to fetch new listings.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <JobCard
                  key={job._id}
                  job={job}
                  onView={() => handleViewJob(job)}
                  onMatch={() => handleAnalyzeMatch(job)}
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
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} jobs)
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

          {pagination.totalPages <= 1 && pagination.total > 0 && (
            <div className="text-center mt-6 text-xs text-slate-400">
              {pagination.total} job(s) found
            </div>
          )}
        </div>

      {selectedJob && (
        <JobDetail
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onApply={() => handleApply(selectedJob)}
          onTrack={() => handleTrackApplication(selectedJob)}
          trackMsg={trackMsg}
        />
      )}

      {matchJob && (
        <JobMatchModal
          jobId={matchJob._id}
          jobTitle={matchJob.title}
          jobCompany={matchJob.companyName}
          onClose={() => setMatchJob(null)}
        />
      )}
    </DashboardLayout>
  );
}

function JobCard({
  job,
  onView,
  onMatch,
}: {
  job: Job;
  onView: () => void;
  onMatch: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
      <div className="flex-1">
        <h3 className="text-base font-semibold text-slate-900 mb-1">{job.title}</h3>
        <p className="text-sm text-slate-600 mb-2">{job.companyName}</p>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {job.location && (
            <span className="text-slate-500">📍 {job.location}</span>
          )}
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
            {job.remoteType}
          </span>
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
            {job.employmentType}
          </span>
        </div>
        {job.salaryMin != null && (
          <p className="text-sm text-slate-700 mb-2">
            {formatSalary(job)}
          </p>
        )}
        <p className="text-xs text-slate-500 mb-3">
          Source: {job.source} | Posted {formatDate(job.postedAt)}
        </p>
      </div>
      <div className="space-y-2">
        <button
          onClick={onView}
          className="w-full px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          View Job
        </button>
        <button
          onClick={onMatch}
          className="w-full px-3 py-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          Analyze Match
        </button>
      </div>
    </div>
  );
}

function JobDetail({
  job,
  onClose,
  onApply,
  onTrack,
  trackMsg,
}: {
  job: Job;
  onClose: () => void;
  onApply: () => void;
  onTrack: () => void;
  trackMsg: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{job.title}</h2>
            <p className="text-sm text-slate-600 mt-1">{job.companyName}</p>
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
            {job.location && (
              <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
                📍 {job.location}
              </span>
            )}
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
              {job.remoteType}
            </span>
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
              {job.employmentType}
            </span>
            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">
              {job.experienceLevel}
            </span>
            {job.salaryMin != null && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">
                {formatSalary(job)}
              </span>
            )}
          </div>

          <div className="mb-4 text-xs text-slate-400">
            Source: {job.source} | Posted {formatDate(job.postedAt)}
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Description
            </h3>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {job.description || "No description available."}
            </p>
          </div>

          {job.technologies.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Technologies
              </h3>
              <div className="flex flex-wrap gap-2">
                {job.technologies.map((tech, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={onTrack}
              className="flex-1 px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Track this job
            </button>
            {job.applyUrl && (
              <button
                onClick={onApply}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Apply
              </button>
            )}
            {job.jobUrl && (
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-center"
              >
                View Source Listing
              </a>
            )}
          </div>
          {trackMsg && (
            <p className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {trackMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSalary(job: Job): string {
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

export default Jobs;
