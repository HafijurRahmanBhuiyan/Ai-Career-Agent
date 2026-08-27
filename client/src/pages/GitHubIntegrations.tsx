import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";

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

const API_BASE = "http://localhost:5001/api";

function GitHubIntegrations() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [importedRepos, setImportedRepos] = useState<ImportedRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [importLoading, setImportLoading] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get<GitHubStatus>(`${API_BASE}/github/status`);
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
      const res = await axios.get<{ repositories: GitHubRepo[] }>(
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
      const res = await axios.get<{ repositories: ImportedRepo[] }>(
        `${API_BASE}/github/repositories/imported`
      );
      setImportedRepos(res.data.repositories);
    } catch {
      setError("Failed to fetch imported repositories");
    }
  };

  const handleConnect = async () => {
    try {
      const res = await axios.get<{ authorizeUrl: string }>(
        `${API_BASE}/github/connect`
      );
      window.location.href = res.data.authorizeUrl;
    } catch {
      setError("Failed to initiate GitHub connection");
    }
  };

  const handleDisconnect = async () => {
    try {
      await axios.post(`${API_BASE}/github/disconnect`);
      setStatus({ connected: false });
      setRepos([]);
      setImportedRepos([]);
    } catch {
      setError("Failed to disconnect GitHub");
    }
  };

  const handleImport = async (repoId: number) => {
    setImportLoading(String(repoId));
    try {
      await axios.post(`${API_BASE}/github/repositories/${repoId}/import`);
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
      await axios.post(`${API_BASE}/github/repositories/${repoId}/sync`);
      await fetchImported();
    } catch {
      setError("Failed to sync repository");
    } finally {
      setSyncLoading(null);
    }
  };

  const handleDelete = async (repoId: number) => {
    try {
      await axios.delete(`${API_BASE}/github/repositories/${repoId}`);
      await fetchImported();
    } catch {
      setError("Failed to delete imported repository");
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
          <NavItem label="GitHub Projects" active />
          <NavItem label="LinkedIn Posts" />
          <NavItem label="Jobs" />
          <NavItem label="Applications" />
          <NavItem label="Emails" />
          <NavItem label="Settings" />
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
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Imported Repositories
                  </h2>
                  <div className="space-y-3">
                    {importedRepos.map((repo) => (
                      <div
                        key={repo._id}
                        className="flex items-center gap-4 p-4 border border-slate-100 rounded-lg"
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
                            onClick={() => handleSync(repo.githubRepositoryId)}
                            disabled={syncLoading === repo.githubRepositoryId}
                            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            {syncLoading === repo.githubRepositoryId
                              ? "Syncing..."
                              : "Sync"}
                          </button>
                          <button
                            onClick={() => handleDelete(repo.githubRepositoryId)}
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
            </>
          )}
        </div>
      </main>
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

export default GitHubIntegrations;
