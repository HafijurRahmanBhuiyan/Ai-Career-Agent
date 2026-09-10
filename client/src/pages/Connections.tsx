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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Connections</h1>
          <p className="text-slate-500 mt-1">
            Manage all of your account connections in one place. Connect GitHub,
            Gmail, and LinkedIn so your Career Agent can import your projects,
            read your career emails, and publish professional content.
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              GitHub
            </h2>
            {gitHubLoading ? (
              <p className="text-sm text-slate-400">Checking connection...</p>
            ) : gitHubStatus?.connected ? (
              <div className="flex items-center gap-4">
                <img
                  src={gitHubStatus.github?.avatarUrl}
                  alt={gitHubStatus.github?.username}
                  className="w-12 h-12 rounded-full border border-slate-200"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {gitHubStatus.github?.username}
                  </p>
                  <p className="text-xs text-slate-500">
                    Connected{" "}
                    {new Date(
                      gitHubStatus.github?.connectedAt || ""
                    ).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={handleGitHubDisconnect}
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
                    Connect your GitHub account to import and analyze
                    repositories
                  </p>
                </div>
                <button
                  onClick={handleGitHubConnect}
                  className="ml-auto px-4 py-2 text-sm text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Connect GitHub
                </button>
              </div>
            )}
            {gitHubError && (
              <div className="mt-4 text-sm text-red-600">{gitHubError}</div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Gmail / Career Email Intelligence
            </h2>
            {gmailLoading ? (
              <p className="text-sm text-slate-400">Checking connection...</p>
            ) : gmailStatus?.connected ? (
              <div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-slate-400 text-lg">@</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {gmailStatus.gmail?.email}
                    </p>
                    <p className="text-xs text-slate-500">
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
                    className="ml-auto px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-5">
                  <p className="text-xs text-slate-500 mb-3">
                    Run a sync to read career-related emails from your Gmail and
                    classify them with AI. Detection is read-only; application
                    status changes automatically only for high-confidence
                    signals when enabled in Settings.
                  </p>
                  <button
                    onClick={handleGmailSync}
                    disabled={gmailSyncLoading}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {gmailSyncLoading ? "Syncing..." : "Sync Gmail"}
                  </button>
                  {gmailSyncResult && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
                        Synced: {gmailSyncResult.synced}
                      </span>
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
                        Career emails: {gmailSyncResult.careerEmails}
                      </span>
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">
                        Classified: {gmailSyncResult.classified}
                      </span>
                      {gmailSyncResult.autoUpdated > 0 && (
                        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-medium">
                          Auto-updated: {gmailSyncResult.autoUpdated}
                        </span>
                      )}
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">
                        Skipped: {gmailSyncResult.skipped}
                      </span>
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded">
                        Failed: {gmailSyncResult.failed}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <span className="text-slate-400 text-lg">@</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Not connected
                  </p>
                  <p className="text-xs text-slate-500">
                    Connect your Gmail (read-only) to classify career emails
                  </p>
                </div>
                <button
                  onClick={handleGmailConnect}
                  className="ml-auto px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Connect Gmail
                </button>
              </div>
            )}
            {gmailError && (
              <div className="mt-4 text-sm text-red-600">{gmailError}</div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              LinkedIn
            </h2>
            {linkedInLoading ? (
              <p className="text-sm text-slate-400">Checking connection...</p>
            ) : linkedInStatus?.connected ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-700 text-lg">in</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {linkedInStatus.linkedin?.displayName ||
                      linkedInStatus.linkedin?.memberId}
                  </p>
                  <p className="text-xs text-slate-500">
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
                  <p className="text-xs text-slate-400 mt-1">
                    Your token stays encrypted on the server and is never exposed
                    in the browser.
                  </p>
                </div>
                <button
                  onClick={handleLinkedInDisconnect}
                  className="ml-auto px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-700 text-lg">in</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Not connected
                  </p>
                  <p className="text-xs text-slate-500">
                    Connect your LinkedIn account to publish approved posts via
                    the official API.
                  </p>
                </div>
                <button
                  onClick={handleLinkedInConnect}
                  disabled={linkedInConnectLoading}
                  className="ml-auto px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {linkedInConnectLoading
                    ? "Connecting…"
                    : "Connect LinkedIn"}
                </button>
              </div>
            )}
            {linkedInError && (
              <div className="mt-4 text-sm text-red-600">{linkedInError}</div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Connections;