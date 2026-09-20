import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { GmailStatus, GmailSyncResult } from "../types/careerEmail";
import { getErrorMessage } from "../utils/apiError";

const API_BASE = "";

interface GitHubStatus {
  connected: boolean;
  github?: {
    username: string;
    profileUrl: string;
    avatarUrl: string;
    connectedAt: string;
  };
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

function Connections() {
  const [searchParams] = useSearchParams();

  const [gitHubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null);
  const [gitHubLoading, setGitHubLoading] = useState(true);
  const [gitHubError, setGitHubError] = useState<string | null>(null);

  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailSyncLoading, setGmailSyncLoading] = useState(false);
  const [gmailSyncResult, setGmailSyncResult] = useState<GmailSyncResult | null>(
    null
  );
  const [gmailError, setGmailError] = useState<string | null>(null);

  const [linkedInStatus, setLinkedInStatus] = useState<LinkedInStatus | null>(
    null
  );
  const [linkedInLoading, setLinkedInLoading] = useState(true);
  const [linkedInConnectLoading, setLinkedInConnectLoading] = useState(false);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);

  const fetchGitHubStatus = useCallback(async () => {
    try {
      const res = await api.get<GitHubStatus>(`${API_BASE}/github/status`);
      setGitHubStatus(res.data);
    } catch {
      setGitHubError("Failed to check GitHub connection status");
    } finally {
      setGitHubLoading(false);
    }
  }, []);

  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await api.get<GmailStatus>(`${API_BASE}/gmail/status`);
      setGmailStatus(res.data);
    } catch {
      setGmailError("Failed to check Gmail connection status");
    } finally {
      setGmailLoading(false);
    }
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

  // Keying on searchParams handles both the initial mount and the OAuth
  // callback return (e.g. /connections?github=connected) exactly once each.
  useEffect(() => {
    fetchGitHubStatus();
    fetchGmailStatus();
    fetchLinkedInStatus();
  }, [searchParams, fetchGitHubStatus, fetchGmailStatus, fetchLinkedInStatus]);

  const handleGitHubConnect = async () => {
    setGitHubError(null);
    try {
      const res = await api.get<{ authorizeUrl: string }>(
        `${API_BASE}/github/connect`
      );
      window.location.href = res.data.authorizeUrl;
    } catch {
      setGitHubError("Failed to initiate GitHub connection");
    }
  };

  const handleGitHubDisconnect = async () => {
    setGitHubError(null);
    try {
      await api.post(`${API_BASE}/github/disconnect`);
      setGitHubStatus({ connected: false });
    } catch {
      setGitHubError("Failed to disconnect GitHub");
    }
  };

  const handleGmailConnect = async () => {
    setGmailError(null);
    try {
      const res = await api.get<{ authorizeUrl: string }>(
        `${API_BASE}/gmail/connect`
      );
      window.location.href = res.data.authorizeUrl;
    } catch {
      setGmailError("Failed to initiate Gmail connection");
    }
  };

  const handleGmailDisconnect = async () => {
    setGmailError(null);
    try {
      await api.post(`${API_BASE}/gmail/disconnect`);
      setGmailStatus({ connected: false });
      setGmailSyncResult(null);
    } catch {
      setGmailError("Failed to disconnect Gmail");
    }
  };

  const handleGmailSync = async () => {
    setGmailSyncLoading(true);
    setGmailError(null);
    try {
      const res = await api.post<GmailSyncResult>(`${API_BASE}/gmail/sync`);
      setGmailSyncResult(res.data);
      fetchGmailStatus();
    } catch (err: unknown) {
      setGmailError(
        getErrorMessage(err, "Failed to sync Gmail career emails")
      );
    } finally {
      setGmailSyncLoading(false);
    }
  };

  const handleLinkedInConnect = async () => {
    setLinkedInError(null);
    setLinkedInConnectLoading(true);
    try {
      const res = await api.get<{ authorizeUrl: string }>(
        `${API_BASE}/linkedin/connect`
      );
      window.location.assign(res.data.authorizeUrl);
    } catch (err: unknown) {
      setLinkedInConnectLoading(false);
      setLinkedInError(
        getErrorMessage(err, "Failed to start LinkedIn connection")
      );
    }
  };

  const handleLinkedInDisconnect = async () => {
    setLinkedInError(null);
    try {
      await api.post(`${API_BASE}/linkedin/disconnect`);
      setLinkedInStatus({ connected: false });
    } catch (err: unknown) {
      setLinkedInError(getErrorMessage(err, "Failed to disconnect LinkedIn"));
    }
  };

  return (
    <DashboardLayout active="Connections">
      <div className="max-w-7xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">Connections</h1>
            <p className="page-subtitle">
              Manage all of your account connections in one place. Connect GitHub,
              Gmail, and LinkedIn so your Career Agent can import your projects,
              read your career emails, and publish professional content.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-slate-700 to-slate-950 flex items-center justify-center text-sm font-bold text-white shadow-glow-primary">
                  GH
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">
                    GitHub
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Projects and repositories for your professional profile
                  </p>
                </div>
              </div>
              {gitHubLoading ? (
                <span className="badge bg-slate-100 text-slate-500">
                  Checking…
                </span>
              ) : gitHubStatus?.connected ? (
                <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-600">
                  Not connected
                </span>
              )}
            </div>

            {gitHubLoading ? (
              <div className="flex items-center gap-2.5 text-sm text-slate-500 py-3">
                <span className="spinner h-4 w-4" />
                Checking connection...
              </div>
            ) : gitHubStatus?.connected ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-slate-50/70 border border-slate-200 p-4">
                <img
                  src={gitHubStatus.github?.avatarUrl}
                  alt={gitHubStatus.github?.username}
                  className="w-12 h-12 shrink-0 rounded-full object-cover ring-2 ring-brand-100"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {gitHubStatus.github?.username}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Connected{" "}
                    {new Date(
                      gitHubStatus.github?.connectedAt || ""
                    ).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={handleGitHubDisconnect}
                  className="btn-danger-outline btn-sm sm:ml-auto shrink-0"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-dashed border-slate-300 p-5">
                <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-slate-700 to-slate-950 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">GH</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Not connected
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Connect your GitHub account to import and analyze
                    repositories
                  </p>
                </div>
                <button
                  onClick={handleGitHubConnect}
                  className="btn-primary btn-sm sm:ml-auto shrink-0"
                >
                  Connect GitHub
                </button>
              </div>
            )}
            {gitHubError && (
              <div className="alert-error mt-4">
                <span>{gitHubError}</span>
              </div>
            )}
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-base font-semibold text-white shadow-glow-primary">
                  @
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">
                    Gmail / Career Email Intelligence
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Read and classify career-related emails with AI
                  </p>
                </div>
              </div>
              {gmailLoading ? (
                <span className="badge bg-slate-100 text-slate-500">
                  Checking…
                </span>
              ) : gmailStatus?.connected ? (
                <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-600">
                  Not connected
                </span>
              )}
            </div>

            {gmailLoading ? (
              <div className="flex items-center gap-2.5 text-sm text-slate-500 py-3">
                <span className="spinner h-4 w-4" />
                Checking connection...
              </div>
            ) : gmailStatus?.connected ? (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-slate-50/70 border border-slate-200 p-4">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">@</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {gmailStatus.gmail?.email}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Connected{" "}
                      {new Date(
                        gmailStatus.gmail?.connectedAt || ""
                      ).toLocaleDateString()}
                      {gmailStatus.gmail?.lastSyncedAt &&
                        ` · Last synced ${new Date(
                          gmailStatus.gmail.lastSyncedAt
                        ).toLocaleString()}`}
                    </p>
                  </div>
                  <button
                    onClick={handleGmailDisconnect}
                    className="btn-danger-outline btn-sm sm:ml-auto shrink-0"
                  >
                    Disconnect
                  </button>
                </div>

                <div className="mt-5 pt-5 border-t border-slate-200">
                  <p className="text-xs text-slate-500 mb-4">
                    Run a sync to read career-related emails from your Gmail and
                    classify them with AI. Detection is read-only; application
                    status changes automatically only for high-confidence
                    signals when enabled in Settings.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleGmailSync}
                      disabled={gmailSyncLoading}
                      className="btn-primary btn-sm"
                    >
                      {gmailSyncLoading && (
                        <span className="spinner h-3.5 w-3.5 !border-white"></span>
                      )}
                      {gmailSyncLoading ? "Syncing..." : "Sync Gmail"}
                    </button>
                    {gmailSyncResult && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="chip bg-slate-100 text-slate-700">
                          Synced: {gmailSyncResult.synced}
                        </span>
                        <span className="chip bg-blue-50 text-blue-700">
                          Career emails: {gmailSyncResult.careerEmails}
                        </span>
                        <span className="chip bg-purple-50 text-purple-700">
                          Classified: {gmailSyncResult.classified}
                        </span>
                        {gmailSyncResult.autoUpdated > 0 && (
                          <span className="chip bg-emerald-50 text-emerald-700 font-medium">
                            Auto-updated: {gmailSyncResult.autoUpdated}
                          </span>
                        )}
                        <span className="chip bg-amber-50 text-amber-700">
                          Skipped: {gmailSyncResult.skipped}
                        </span>
                        <span className="chip bg-red-50 text-red-700">
                          Failed: {gmailSyncResult.failed}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-dashed border-slate-300 p-5">
                <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
                  <span className="text-white font-semibold text-lg">@</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Not connected
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Connect your Gmail (read-only) to classify career emails
                  </p>
                </div>
                <button
                  onClick={handleGmailConnect}
                  className="btn-primary btn-sm sm:ml-auto shrink-0"
                >
                  Connect Gmail
                </button>
              </div>
            )}
            {gmailError && (
              <div className="alert-error mt-4">
                <span>{gmailError}</span>
              </div>
            )}
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-sm font-bold text-white shadow-glow-primary">
                  in
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">
                    LinkedIn
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Publish approved posts via the official API
                  </p>
                </div>
              </div>
              {linkedInLoading ? (
                <span className="badge bg-slate-100 text-slate-500">
                  Checking…
                </span>
              ) : linkedInStatus?.connected ? (
                <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-600">
                  Not connected
                </span>
              )}
            </div>

            {linkedInLoading ? (
              <div className="flex items-center gap-2.5 text-sm text-slate-500 py-3">
                <span className="spinner h-4 w-4" />
                Checking connection...
              </div>
            ) : linkedInStatus?.connected ? (
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 rounded-xl bg-slate-50/70 border border-slate-200 p-4">
                <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">in</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {linkedInStatus.linkedin?.displayName ||
                      linkedInStatus.linkedin?.memberId}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Connected{" "}
                    {linkedInStatus.linkedin?.connectedAt
                      ? new Date(
                          linkedInStatus.linkedin.connectedAt
                        ).toLocaleDateString()
                      : ""}
                    {linkedInStatus.linkedin?.lastUsedAt &&
                      ` · Last used ${new Date(
                        linkedInStatus.linkedin.lastUsedAt
                      ).toLocaleString()}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Your token stays encrypted on the server and is never exposed
                    in the browser.
                  </p>
                </div>
                <button
                  onClick={handleLinkedInDisconnect}
                  className="btn-danger-outline btn-sm sm:ml-auto shrink-0"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-dashed border-slate-300 p-5">
                <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">in</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Not connected
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Connect your LinkedIn account to publish approved posts via
                    the official API.
                  </p>
                </div>
                <button
                  onClick={handleLinkedInConnect}
                  disabled={linkedInConnectLoading}
                  className="btn-primary btn-sm sm:ml-auto shrink-0"
                >
                  {linkedInConnectLoading
                    ? "Connecting…"
                    : "Connect LinkedIn"}
                </button>
              </div>
            )}
            {linkedInError && (
              <div className="alert-error mt-4">
                <span>{linkedInError}</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Connections;