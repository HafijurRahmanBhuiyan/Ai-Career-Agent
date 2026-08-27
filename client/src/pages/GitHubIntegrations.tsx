import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";

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

  useEffect(() => {
    if (searchParams.get("github") === "connected") {
      fetchStatus();
    }
  }, [searchParams, fetchStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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

  const handleConnect = async () => {
    try {
      const res = await api.get<{ authorizeUrl: string }>(
        `${API_BASE}/github/connect`
      );
      window.location.href = res.data.authorizeUrl;
    } catch {
      setError("Failed to initiate GitHub connection");
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post(`${API_BASE}/github/disconnect`);
      setStatus({ connected: false });
      setRepos([]);
      setImportedRepos([]);
      setSelectedRepo(null);
      setAnalysis(null);
      setAnalysisHistory([]);
    } catch {
      setError("Failed to disconnect GitHub");
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
        `${API_BASE}/github/repositories/${repoId}/analyze`
      );
      setAnalysis(res.data.analysis);
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
        `${API_BASE}/github/repositories/${repoId}/reanalyze`
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <DashboardLayout active="GitHub Projects">
      <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">
              GitHub Integration
            </h1>
            <p className="text-slate-500 mt-1">
              Connect your GitHub account to import and analyze your repositories
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

          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Connection Status
            </h2>
            {status?.connected ? (
              <div className="flex items-center gap-4">
                <img
                  src={status.github?.avatarUrl}
                  alt={status.github?.username}
                  className="w-12 h-12 rounded-full border border-slate-200"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {status.github?.username}
                  </p>
                  <p className="text-xs text-slate-500">
                    Connected {new Date(status.github?.connectedAt || "").toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="ml-auto px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <span className="text-slate-400 text-lg">GH</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Not connected
                  </p>
                  <p className="text-xs text-slate-500">
                    Connect your GitHub account to import repositories
                  </p>
                </div>
                <button
                  onClick={handleConnect}
                  className="ml-auto px-4 py-2 text-sm text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Connect GitHub
                </button>
              </div>
            )}
          </div>

          {status?.connected && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    GitHub Repositories
                  </h2>
                  <button
                    onClick={fetchRepos}
                    disabled={reposLoading}
                    className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {reposLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
                {reposLoading ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    Loading repositories...
                  </div>
                ) : repos.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No repositories found.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {repos.map((repo) => (
                      <div
                        key={repo.id}
                        className="flex items-center gap-4 p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {repo.name}
                            </p>
                            {repo.private && (
                              <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                                Private
                              </span>
                            )}
                            {repo.fork && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                Fork
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-1">
                            {repo.description || "No description"}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                            {repo.language && <span>{repo.language}</span>}
                            <span>Stars: {repo.stars}</span>
                            <span>Forks: {repo.forks}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isImported(repo.id) ? (
                            <span className="px-3 py-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">
                              Imported
                            </span>
                          ) : (
                            <button
                              onClick={() => handleImport(repo.id)}
                              disabled={importLoading === String(repo.id)}
                              className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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
                <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Imported Repositories
                  </h2>
                  <div className="space-y-3">
                    {importedRepos.map((repo) => (
                      <div
                        key={repo._id}
                        className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedRepo?.githubRepositoryId === repo.githubRepositoryId
                            ? "border-blue-300 bg-blue-50"
                            : "border-slate-100 hover:bg-slate-50"
                        }`}
                        onClick={() => handleSelectRepo(repo)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {repo.fullName}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-1">
                            {repo.description || "No description"}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                            {repo.language && <span>{repo.language}</span>}
                            <span>Stars: {repo.stars}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(repo.githubRepositoryId);
                            }}
                            disabled={analyzeLoading === repo.githubRepositoryId}
                            className="px-3 py-1.5 text-xs text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
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
                            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
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
                            className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
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
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        Analysis: {selectedRepo.fullName}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        AI-powered project analysis
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleReanalyze(selectedRepo.githubRepositoryId)
                      }
                      disabled={analyzeLoading === selectedRepo.githubRepositoryId}
                      className="px-4 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {analyzeLoading === selectedRepo.githubRepositoryId
                        ? "Analyzing..."
                        : "Re-analyze"}
                    </button>
                  </div>

                  {analysisLoading && (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-4"></div>
                      <p className="text-slate-500 text-sm">
                        Loading analysis...
                      </p>
                    </div>
                  )}

                  {!analysisLoading && !analysis && (
                    <div className="text-center py-12">
                      <p className="text-slate-400 text-sm mb-4">
                        No analysis available yet
                      </p>
                      <button
                        onClick={() =>
                          handleAnalyze(selectedRepo.githubRepositoryId)
                        }
                        disabled={analyzeLoading === selectedRepo.githubRepositoryId}
                        className="px-4 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
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
                      <div className="grid grid-cols-2 gap-4">
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
                      <div className="text-xs text-slate-400 pt-4 border-t border-slate-100">
                        Model: {analysis.aiModel} | Prompt: {analysis.promptVersion} | Analyzed:{" "}
                        {new Date(analysis.analyzedAt).toLocaleString()}
                      </div>
                    </div>
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
                            className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                              analysis?._id === a._id
                                ? "border-purple-300 bg-purple-50"
                                : "border-slate-100 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-slate-700">
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
    ? "border-green-200"
    : border === "blue"
      ? "border-blue-200"
      : "border-slate-100";

  return (
    <div className={`border ${borderClass} rounded-lg p-4`}>
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
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
    green: "bg-green-50 text-green-700 border-green-200",
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
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <span
            key={idx}
            className={`text-xs px-2 py-1 border rounded-md ${tagClass}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default GitHubIntegrations;
