import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";

interface GitHubStatus {
  connected: boolean;
  github?: {
    username: string;
    profileUrl: string;
    avatarUrl: string;
    connectedAt: string;
  };
}

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  private: boolean;
  fork: boolean;
}

interface ImportedRepo {
  _id: string;
  githubRepositoryId: number;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  importedAt: string;
  approvedForProfessionalUse: boolean;
  approvedAt: string | null;
}

interface AnalysisData {
  _id: string;
  projectSummary: string;
  problemStatement: string;
  keyFeatures: string[];
  technologies: string[];
  programmingLanguages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
  cloudServices: string[];
  architecture: string;
  developmentHighlights: string[];
  skillsDemonstrated: string[];
  difficultyLevel: "Beginner" | "Intermediate" | "Advanced";
  developerRole: string;
  resumeDescription: string;
  linkedinDescription: string;
  suggestedTags: string[];
  aiModel: string;
  promptVersion: string;
  analyzedAt: string;
}

const API_BASE = "";

interface AIProviderOption {
  provider: "claude" | "gemini" | "openai";
  model: string;
  available: boolean;
}

interface LinkedInStatus {
  connected: boolean;
  linkedin?: {
    memberId: string;
    profileUrn: string;
    displayName: string | null;
    isActive: boolean;
    connectedAt: string | null;
    tokenExpiry: string | null;
    lastUsedAt: string | null;
  };
}

interface LinkedInPreview {
  approved: boolean;
  repository: {
    _id: string;
    githubRepositoryId: number;
    name: string;
    fullName: string;
    approvedForProfessionalUse: boolean;
    approvedAt: string | null;
  };
  content: string;
  draft: {
    _id: string;
    status: string;
    linkedinPostUrn: string | null;
    linkedinPostUrl: string | null;
    publishedAt: string | null;
    publishErrorCode: string | null;
    publishErrorMessageSafe: string | null;
    updatedAt: string;
  } | null;
}

interface LinkedInPublishResult {
  posted: boolean;
  postUrn: string | null;
  postUrl: string | null;
  message: string;
}

function GitHubIntegrations() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [importedRepos, setImportedRepos] = useState<ImportedRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [importLoading, setImportLoading] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState<number | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedRepo, setSelectedRepo] = useState<ImportedRepo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisData[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [aiProviders, setAiProviders] = useState<AIProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [providersError, setProvidersError] = useState<string | null>(null);

  const [linkedInStatus, setLinkedInStatus] = useState<LinkedInStatus | null>(
    null
  );
  const [linkedInLoading, setLinkedInLoading] = useState(true);
  const [linkedInContent, setLinkedInContent] = useState("");
  const [linkedInPreviewLoading, setLinkedInPreviewLoading] = useState(false);
  const [linkedInPublishing, setLinkedInPublishing] = useState(false);
  const [publishResult, setPublishResult] =
    useState<LinkedInPublishResult | null>(null);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<GitHubStatus>(`${API_BASE}/github/status`);
      setStatus(res.data);
      if (res.data.connected) {
        await Promise.all([fetchRepos(), fetchImported()]);
      }
    } catch {
      setError("Failed to check GitHub connection status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Single source of truth for the initial load and the OAuth callback return:
  // the URL changes (adds ?xxx=connected) when the callback lands, so keying on
  // searchParams fires exactly once per navigation instead of duplicating the
  // status/repo fetch (mount effect + param effect used to run the same request
  // twice on every callback landing).
  useEffect(() => {
    fetchStatus();
  }, [searchParams, fetchStatus]);

  const fetchAIProviders = async () => {
    try {
      const res = await api.get<{
        providers: AIProviderOption[];
        defaultProvider: string | null;
      }>(`${API_BASE}/ai/providers`);
      setAiProviders(res.data.providers);
      const enabled = res.data.providers.filter((p) => p.available);
      const fallback =
        res.data.defaultProvider &&
        res.data.providers.find(
          (p) => p.provider === res.data.defaultProvider && p.available
        );
      setSelectedProvider(
        (fallback || enabled[0] || res.data.providers[0])?.provider || ""
      );
    } catch {
      setProvidersError("Failed to load AI providers");
    }
  };

  useEffect(() => {
    fetchAIProviders();
  }, []);

  const fetchLinkedInStatus = useCallback(async () => {
    try {
      const res = await api.get<LinkedInStatus>(`${API_BASE}/linkedin/status`);
      setLinkedInStatus(res.data);
    } catch {
      setLinkedInStatus({ connected: false });
    } finally {
      setLinkedInLoading(false);
    }
  }, []);

  // See the GitHub effect above - keying on searchParams handles both the
  // initial mount and the ?linkedin=connected callback return exactly once.
  useEffect(() => {
    fetchLinkedInStatus();
  }, [searchParams, fetchLinkedInStatus]);

  const handleApprove = async (repo: ImportedRepo, approved: boolean) => {
    setError(null);
    try {
      const res = await api.post<{ repository: ImportedRepo }>(
        `${API_BASE}/github/repositories/${repo.githubRepositoryId}/approve`,
        { approved }
      );
      const updated = res.data.repository;
      setImportedRepos((prev) =>
        prev.map((r) =>
          r.githubRepositoryId === updated.githubRepositoryId
            ? { ...r, ...updated }
            : r
        )
      );
      if (selectedRepo?.githubRepositoryId === updated.githubRepositoryId) {
        setSelectedRepo((cur) => (cur ? { ...cur, ...updated } : cur));
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update repository approval"));
    }
  };

  const loadLinkedInPreview = async (repo: ImportedRepo) => {
    setLinkedInPreviewLoading(true);
    try {
      const res = await api.get<LinkedInPreview>(
        `${API_BASE}/github/repositories/${repo.githubRepositoryId}/linkedin-preview`
      );
      if (res.data.content) {
        setLinkedInContent(res.data.content);
      }
    } catch {
      // Preview is best-effort; the editor still works from the AI analysis.
    } finally {
      setLinkedInPreviewLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedRepo) return;
    if (!linkedInContent.trim()) return;
    setLinkedInError(null);
    setPublishResult(null);
    setLinkedInPublishing(true);
    try {
      const res = await api.post<LinkedInPublishResult>(
        `${API_BASE}/github/repositories/${selectedRepo.githubRepositoryId}/linkedin-draft/publish`,
        { content: linkedInContent }
      );
      setPublishResult(res.data);
      if (res.data.posted) {
        loadLinkedInPreview(selectedRepo);
      }
    } catch (err: unknown) {
      setLinkedInError(getErrorMessage(err, "Failed to publish to LinkedIn"));
    } finally {
      setLinkedInPublishing(false);
    }
  };

  const analysisId = analysis?._id ?? null;

  useEffect(() => {
    if (analysis) {
      setLinkedInContent(analysis.linkedinDescription || "");
      setPublishResult(null);
      setLinkedInError(null);
    }
  }, [analysisId]);

  useEffect(() => {
    if (selectedRepo && selectedRepo.approvedForProfessionalUse && analysis) {
      loadLinkedInPreview(selectedRepo);
    }
  }, [
    selectedRepo?.githubRepositoryId,
    selectedRepo?.approvedForProfessionalUse,
    analysisId,
  ]);

  const fetchRepos = async () => {
    setReposLoading(true);
    try {
      const res = await api.get<{ repositories: GitHubRepo[] }>(
        `${API_BASE}/github/repositories`
      );
      setRepos(res.data.repositories);
    } catch {
      setError("Failed to fetch repositories");
    } finally {
      setReposLoading(false);
    }
  };

  const fetchImported = async () => {
    try {
      const res = await api.get<{ repositories: ImportedRepo[] }>(
        `${API_BASE}/github/repositories/imported`
      );
      setImportedRepos(res.data.repositories);
    } catch {
      setError("Failed to fetch imported repositories");
    }
  };

  const handleImport = async (repoId: number) => {
    setImportLoading(String(repoId));
    try {
      await api.post(`${API_BASE}/github/repositories/${repoId}/import`);
      await fetchImported();
    } catch {
      setError("Failed to import repository");
    } finally {
      setImportLoading(null);
    }
  };

  const handleSync = async (repoId: number) => {
    setSyncLoading(repoId);
    try {
      await api.post(`${API_BASE}/github/repositories/${repoId}/sync`);
      await fetchImported();
    } catch {
      setError("Failed to sync repository");
    } finally {
      setSyncLoading(null);
    }
  };

  const handleDelete = async (repoId: number) => {
    try {
      await api.delete(`${API_BASE}/github/repositories/${repoId}`);
      await fetchImported();
      if (selectedRepo?.githubRepositoryId === repoId) {
        setSelectedRepo(null);
        setAnalysis(null);
        setAnalysisHistory([]);
        setLinkedInContent("");
        setPublishResult(null);
        setLinkedInError(null);
      }
    } catch {
      setError("Failed to delete imported repository");
    }
  };

  const handleAnalyze = async (repoId: number) => {
    setAnalyzeLoading(repoId);
    setError(null);
    try {
      const res = await api.post<{ analysis: AnalysisData; readmeTruncated: boolean }>(
        `${API_BASE}/github/repositories/${repoId}/analyze`,
        { provider: selectedProvider || undefined }
      );
      setAnalysis(res.data.analysis);

      const repo = importedRepos.find(
        (r) => r.githubRepositoryId === repoId
      );

      if (repo) {
        setSelectedRepo(repo);
        await fetchAnalysisHistory(repoId);
      }

      if (res.data.readmeTruncated) {
        setError("README was truncated due to size limits");
      }
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Failed to analyze repository";
      setError(msg);
    } finally {
      setAnalyzeLoading(null);
    }
  };

  const handleReanalyze = async (repoId: number) => {
    setAnalyzeLoading(repoId);
    setError(null);
    try {
      const res = await api.post<{ analysis: AnalysisData; readmeTruncated: boolean }>(
        `${API_BASE}/github/repositories/${repoId}/reanalyze`,
        { provider: selectedProvider || undefined }
      );
      setAnalysis(res.data.analysis);
      if (selectedRepo) {
        fetchAnalysisHistory(selectedRepo.githubRepositoryId);
      }
      if (res.data.readmeTruncated) {
        setError("README was truncated due to size limits");
      }
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Failed to reanalyze repository";
      setError(msg);
    } finally {
      setAnalyzeLoading(null);
    }
  };

  const fetchAnalysisHistory = async (repoId: number) => {
    try {
      const res = await api.get<{ analyses: AnalysisData[] }>(
        `${API_BASE}/github/repositories/${repoId}/analyses`
      );
      setAnalysisHistory(res.data.analyses);
    } catch {
      setAnalysisHistory([]);
    }
  };

  const handleSelectRepo = async (repo: ImportedRepo) => {
    setSelectedRepo(repo);
    setAnalysis(null);
    setAnalysisHistory([]);
    setLinkedInContent("");
    setPublishResult(null);
    setLinkedInError(null);
    setAnalysisLoading(true);
    try {
      const res = await api.get<{ analysis: AnalysisData }>(
        `${API_BASE}/github/repositories/${repo.githubRepositoryId}/analysis`
      );
      setAnalysis(res.data.analysis);
      fetchAnalysisHistory(repo.githubRepositoryId);
    } catch {
      setAnalysis(null);
      fetchAnalysisHistory(repo.githubRepositoryId);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const isImported = (repoId: number) =>
    importedRepos.some((r) => r.githubRepositoryId === repoId);

  if (loading) {
    return (
      <div className="min-h-screen bg-app-mesh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner h-8 w-8 border-brand-600"></div>
          <p className="text-sm text-slate-500">Loading your GitHub integration…</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout active="GitHub Projects">
      <div className="max-w-7xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">GitHub Projects</h1>
            <p className="page-subtitle">
              Import and analyze your GitHub repositories. Manage your GitHub
              connection from the{" "}
              <Link
                to="/dashboard/connections"
                className="text-brand-600 font-medium hover:underline"
              >
                Connections
              </Link>{" "}
              page.
            </p>
          </div>
          {status?.connected && (
            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="w-3 h-3"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Connected to GitHub
            </span>
          )}
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {!status?.connected && (
          <div className="alert-info mb-6">
            <span>
              Your GitHub account is not connected. Connect it from the{" "}
              <Link to="/dashboard/connections" className="font-medium underline">
                Connections
              </Link>{" "}
              page to import and analyze repositories.
            </span>
          </div>
        )}

          {status?.connected && (
            <>
              <div className="card p-5 sm:p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5"
                      >
                        <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-2.23c-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.4-2.7 5.38-5.26 5.67.41.36.78 1.05.78 2.13v3.16c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        GitHub Repositories
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        From your connected GitHub account
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={fetchRepos}
                    disabled={reposLoading}
                    className="btn-outline btn-sm"
                  >
                    {reposLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
                {reposLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400 text-sm">
                    <div className="spinner h-6 w-6"></div>
                    Loading repositories...
                  </div>
                ) : repos.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No repositories found.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-0.5">
                    {repos.map((repo) => (
                      <div
                        key={repo.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 border border-slate-100 rounded-xl hover:bg-slate-50 hover:border-slate-200 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {repo.name}
                            </p>
                            {repo.private && (
                              <span className="badge bg-amber-50 text-amber-700 border border-amber-200">
                                Private
                              </span>
                            )}
                            {repo.fork && (
                              <span className="badge bg-brand-50 text-brand-700 border border-brand-200">
                                Fork
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-1">
                            {repo.description || "No description"}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-400">
                            {repo.language && (
                              <span className="chip bg-slate-50 border border-slate-100 text-slate-500">
                                {repo.language}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-amber-400">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                              </svg>
                              {repo.stars}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                                <path d="M18 2a2 2 0 0 1 2 2v13.59a2 2 0 0 1-.59 1.41L13.86 25" />
                                <path d="M2 2v22" />
                              </svg>
                              {repo.forks}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:shrink-0">
                          {isImported(repo.id) ? (
                            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              Imported
                            </span>
                          ) : (
                            <button
                              onClick={() => handleImport(repo.id)}
                              disabled={importLoading === String(repo.id)}
                              className="btn-primary btn-sm"
                            >
                              {importLoading === String(repo.id)
                                ? "Importing..."
                                : "Import"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {importedRepos.length > 0 && (
                <div className="card p-5 sm:p-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-[0_8px_20px_-8px_rgb(124_58_237/0.55)]">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-5 h-5"
                        >
                          <path d="M12 3v6m0 6v6m-3.5-14.5a3.5 3.5 0 1 0 7 0" />
                          <path d="M5 21h14" />
                          <path d="M12 15l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Imported Repositories
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {importedRepos.length}{" "}
                          {importedRepos.length === 1
                            ? "repository"
                            : "repositories"}{" "}
                          ready for AI analysis
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <label
                        htmlFor="ai-provider"
                        className="text-xs font-semibold text-slate-500 uppercase tracking-wide"
                      >
                        AI Model
                      </label>
                      <select
                        id="ai-provider"
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        disabled={analyzeLoading !== null}
                        className="select text-xs !w-auto !py-2 disabled:opacity-50"
                      >
                        {aiProviders.map((p) => (
                          <option
                            key={p.provider}
                            value={p.provider}
                            disabled={!p.available}
                          >
                            {p.provider === "claude"
                              ? "Claude"
                              : p.provider === "gemini"
                                ? "Gemini"
                                : "OpenAI"}
                            {p.available ? "" : " (not configured)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {providersError && (
                    <p className="mb-3 text-xs text-red-600 font-medium">
                      {providersError}
                    </p>
                  )}
                  <div className="space-y-3">
                    {importedRepos.map((repo) => (
                      <div
                        key={repo._id}
                        className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                          selectedRepo?.githubRepositoryId === repo.githubRepositoryId
                            ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-500/20"
                            : "border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                        }`}
                        onClick={() => handleSelectRepo(repo)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-900 truncate min-w-0 flex-1">
                              {repo.fullName}
                            </p>
                            {repo.approvedForProfessionalUse && (
                              <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Approved
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-1">
                            {repo.description || "No description"}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-400">
                            {repo.language && (
                              <span className="chip bg-slate-50 border border-slate-100 text-slate-500">
                                {repo.language}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-amber-400">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                              </svg>
                              {repo.stars}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(repo.githubRepositoryId);
                            }}
                            disabled={analyzeLoading === repo.githubRepositoryId}
                            className="btn-primary btn-sm"
                          >
                            {analyzeLoading === repo.githubRepositoryId
                              ? "Analyzing..."
                              : "Analyze with AI"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSync(repo.githubRepositoryId);
                            }}
                            disabled={syncLoading === repo.githubRepositoryId}
                            className="btn-outline btn-sm"
                          >
                            {syncLoading === repo.githubRepositoryId
                              ? "Syncing..."
                              : "Sync"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(repo.githubRepositoryId);
                            }}
                            className="btn-danger-outline btn-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRepo && (
                <div className="card p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white flex items-center justify-center shadow-glow-primary">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-5 h-5"
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="m21 21-4.3-4.3" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Analysis: {selectedRepo.fullName}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          AI-powered project analysis
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleReanalyze(selectedRepo.githubRepositoryId)
                      }
                      disabled={analyzeLoading === selectedRepo.githubRepositoryId}
                      className="btn-primary btn-sm"
                    >
                      {analyzeLoading === selectedRepo.githubRepositoryId
                        ? "Analyzing..."
                        : "Re-analyze"}
                    </button>
                  </div>

                  {analysisLoading && (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <div className="spinner h-8 w-8"></div>
                      <p className="text-sm text-slate-500">
                        Loading analysis...
                      </p>
                    </div>
                  )}

                  {!analysisLoading && !analysis && (
                    <div className="flex flex-col items-center justify-center gap-4 py-12">
                      <div className="w-12 h-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-400">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-6 h-6"
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="m21 21-4.3-4.3" />
                        </svg>
                      </div>
                      <p className="text-sm text-slate-400">
                        No analysis available yet
                      </p>
                      <button
                        onClick={() =>
                          handleAnalyze(selectedRepo.githubRepositoryId)
                        }
                        disabled={analyzeLoading === selectedRepo.githubRepositoryId}
                        className="btn-primary btn-sm"
                      >
                        Run AI Analysis
                      </button>
                    </div>
                  )}

                  {!analysisLoading && analysis && (
                    <div className="space-y-6">
                      <AnalysisCard
                        title="Project Summary"
                        content={analysis.projectSummary}
                      />
                      <AnalysisCard
                        title="Problem Statement"
                        content={analysis.problemStatement}
                      />
                      <AnalysisSection
                        title="Key Features"
                        items={analysis.keyFeatures}
                      />
                      <AnalysisSection
                        title="Technologies"
                        items={analysis.technologies}
                        color="blue"
                      />
                      <AnalysisSection
                        title="Programming Languages"
                        items={analysis.programmingLanguages}
                        color="green"
                      />
                      <AnalysisSection
                        title="Frameworks"
                        items={analysis.frameworks}
                        color="purple"
                      />
                      <AnalysisSection
                        title="Databases"
                        items={analysis.databases}
                        color="amber"
                      />
                      <AnalysisSection
                        title="Tools"
                        items={analysis.tools}
                        color="slate"
                      />
                      <AnalysisSection
                        title="Cloud Services"
                        items={analysis.cloudServices}
                        color="cyan"
                      />
                      <AnalysisCard
                        title="Architecture"
                        content={analysis.architecture}
                      />
                      <AnalysisSection
                        title="Development Highlights"
                        items={analysis.developmentHighlights}
                      />
                      <AnalysisSection
                        title="Skills Demonstrated"
                        items={analysis.skillsDemonstrated}
                        color="indigo"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <AnalysisCard
                          title="Difficulty Level"
                          content={analysis.difficultyLevel}
                        />
                        <AnalysisCard
                          title="Developer Role"
                          content={analysis.developerRole}
                        />
                      </div>
                      <AnalysisCard
                        title="Resume Description"
                        content={analysis.resumeDescription}
                        border="green"
                      />
                      <AnalysisCard
                        title="LinkedIn Description"
                        content={analysis.linkedinDescription}
                        border="blue"
                      />
                      <AnalysisSection
                        title="Suggested Tags"
                        items={analysis.suggestedTags}
                        color="pink"
                      />
                      <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                        <span className="chip bg-slate-50 border border-slate-100 text-slate-500">
                          Model: {analysis.aiModel}
                        </span>
                        <span className="chip bg-slate-50 border border-slate-100 text-slate-500">
                          Prompt: {analysis.promptVersion}
                        </span>
                        <span className="chip bg-slate-50 border border-slate-100 text-slate-500">
                          Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {!analysisLoading && analysis && (
                    <section className="mt-8 pt-6 border-t border-slate-200">
                      <div className="mb-5">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-5 h-5 text-brand-600"
                          >
                            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05a3.75 3.75 0 0 1 3.38-1.86c3.61 0 4.28 2.38 4.28 5.47zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
                          </svg>
                          LinkedIn Posting
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                          Review the AI-generated post, approve the repository,
                          then publish to LinkedIn.
                        </p>
                      </div>

                      <div className="card p-4 sm:p-5 mb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              {selectedRepo?.approvedForProfessionalUse ? (
                                <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                                    <path d="M20 6 9 17l-5-5" />
                                  </svg>
                                  Approved
                                </span>
                              ) : (
                                <span className="badge bg-amber-50 text-amber-700 border border-amber-200">
                                  Pending approval
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-900 mt-2">
                              {selectedRepo?.approvedForProfessionalUse
                                ? "Approved for Professional Use"
                                : "Not approved for Professional Use"}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {selectedRepo?.approvedForProfessionalUse
                                ? selectedRepo.approvedAt
                                  ? `Approved ${new Date(selectedRepo.approvedAt).toLocaleDateString()}`
                                  : "Approved"
                                : "Repository approval is required before posting to LinkedIn."}
                            </p>
                          </div>
                          {selectedRepo?.approvedForProfessionalUse ? (
                            <button
                              onClick={() =>
                                selectedRepo && handleApprove(selectedRepo, false)
                              }
                              className="btn-danger-outline btn-sm"
                            >
                              Revoke Approval
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                selectedRepo && handleApprove(selectedRepo, true)
                              }
                              className="btn btn-sm text-white bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-[0_8px_20px_-8px_rgb(16_185_129/0.55)]"
                            >
                              Approve for Professional Use
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="card p-4 sm:p-5 mb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 shrink-0 rounded-xl bg-[#0A66C2] text-white flex items-center justify-center">
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4"
                              >
                                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05a3.75 3.75 0 0 1 3.38-1.86c3.61 0 4.28 2.38 4.28 5.47zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">
                                {linkedInLoading
                                  ? "Checking LinkedIn connection..."
                                  : linkedInStatus?.connected
                                    ? `LinkedIn connected${
                                        linkedInStatus.linkedin?.displayName
                                          ? ` as ${linkedInStatus.linkedin.displayName}`
                                          : ""
                                      }`
                                    : "LinkedIn not connected"}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {linkedInStatus?.connected
                                  ? "Your token stays encrypted on the server and is never exposed in the browser."
                                  : "Connect your LinkedIn account to publish approved posts."}
                              </p>
                            </div>
                          </div>
                          {linkedInLoading ? (
                            <span className="text-xs text-slate-400 flex items-center gap-2">
                              <span className="spinner h-3.5 w-3.5"></span>
                              Loading…
                            </span>
                          ) : linkedInStatus?.connected ? (
                            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              Connected
                            </span>
                          ) : (
                            <Link
                              to="/dashboard/connections"
                              className="btn-secondary btn-sm"
                            >
                              Connect in Connections
                            </Link>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label
                            htmlFor="linkedin-post-content"
                            className="field-label !mb-0"
                          >
                            LinkedIn Post Preview
                          </label>
                          <span
                            className={`badge ${
                              linkedInContent.length > 3000
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {linkedInContent.length} / 3000
                          </span>
                        </div>
                        {linkedInPreviewLoading && (
                          <p className="text-xs text-slate-400 mb-2">
                            Loading LinkedIn preview…
                          </p>
                        )}
                        <textarea
                          id="linkedin-post-content"
                          rows={8}
                          value={linkedInContent}
                          onChange={(e) => {
                            setLinkedInContent(e.target.value);
                            setPublishResult(null);
                            setLinkedInError(null);
                          }}
                          placeholder="Your LinkedIn post content. Start from the AI-generated text and edit freely."
                          className="textarea"
                        />
                      </div>

                      {linkedInError && (
                        <div className="alert-error mt-3">
                          <span>{linkedInError}</span>
                        </div>
                      )}

                      {publishResult?.posted && (
                        <div className="alert-success mt-4">
                          <div>
                            <p className="font-medium">Published to LinkedIn</p>
                            {publishResult.postUrl && (
                              <a
                                href={publishResult.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block text-brand-700 underline hover:text-brand-900 font-medium"
                              >
                                View on LinkedIn
                              </a>
                            )}
                            {publishResult.postUrn && (
                              <p className="mt-1 text-xs text-emerald-700 break-all">
                                {publishResult.postUrn}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-5 flex items-center justify-end gap-3">
                        <button
                          onClick={handlePublish}
                          disabled={
                            !selectedRepo?.approvedForProfessionalUse ||
                            !linkedInStatus?.connected ||
                            !linkedInContent.trim() ||
                            linkedInPublishing
                          }
                          className="btn-primary"
                        >
                          {linkedInPublishing
                            ? "Publishing…"
                            : "Post to LinkedIn"}
                        </button>
                      </div>
                      {!selectedRepo?.approvedForProfessionalUse && (
                        <p className="mt-2 text-xs text-slate-400 text-right">
                          Approve the repository to enable posting.
                        </p>
                      )}
                      {selectedRepo?.approvedForProfessionalUse &&
                        !linkedInStatus?.connected && (
                          <p className="mt-2 text-xs text-slate-400 text-right">
                            Connect LinkedIn on the{" "}
                            <Link
                              to="/dashboard/connections"
                              className="text-blue-600 hover:underline"
                            >
                              Connections
                            </Link>{" "}
                            page to enable posting.
                          </p>
                        )}
                    </section>
                  )}

                  {analysisHistory.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-900 mb-3">
                        Analysis History ({analysisHistory.length})
                      </h3>
                      <div className="space-y-2">
                        {analysisHistory.map((a) => (
                          <button
                            key={a._id}
                            onClick={() => setAnalysis(a)}
                            className={`w-full text-left p-3 rounded-xl border text-sm transition-colors ${
                              analysis?._id === a._id
                                ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-500/20"
                                : "border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-slate-700 font-medium">
                                {new Date(a.analyzedAt).toLocaleString()}
                              </span>
                              <span className="text-xs text-slate-400">
                                {a.aiModel} | {a.difficultyLevel}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
    </DashboardLayout>
  );
}

function AnalysisCard({
  title,
  content,
  border,
}: {
  title: string;
  content: string;
  border?: string;
}) {
  const borderClass = border === "green"
    ? "border-emerald-200"
    : border === "blue"
      ? "border-brand-200"
      : "border-slate-100";

  return (
    <div className={`rounded-xl border ${borderClass} bg-white px-4 py-4 shadow-sm`}>
      <h4 className="section-title mb-2">{title}</h4>
      <p className="text-sm text-slate-700 leading-relaxed">{content}</p>
    </div>
  );
}

function AnalysisSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color?: string;
}) {
  if (!items || items.length === 0) return null;

  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    pink: "bg-pink-50 text-pink-700 border-pink-200",
  };

  const tagClass = color ? colorClasses[color] || colorClasses.slate : colorClasses.slate;

  return (
    <div>
      <h4 className="section-title mb-2">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <span
            key={idx}
            className={`chip border ${tagClass}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default GitHubIntegrations;
