import GitHubConnection from "../models/GitHubConnection";
import { decryptToken, encryptToken } from "../utils/encryption";
import { GitHubService } from "../integrations/github/github.service";
import { GitHubClient } from "../integrations/github/githubClient";
import { AppError } from "../middleware/errorHandler";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// GitHub access tokens from OAuth apps with expiring tokens enabled are
// short-lived (default 8 hours). When several requests run in parallel after
// an idle period, they can each see the same expired token. Single-flight the
// refresh so only one refresh happens and every caller gets the same result.
const refreshInFlight = new Map<string, Promise<string | null>>();

async function getConnection(userId: string) {
  const connection = await GitHubConnection.findOne({
    user: userId,
  }).select("+accessToken +refreshToken");

  if (!connection) {
    throw new AppError(
      "GitHub account not connected. Please connect GitHub first.",
      400
    );
  }

  return connection;
}

/**
 * Refreshes the stored GitHub access token (and rotating refresh token) via
 * GitHub's OAuth refresh endpoint. Returns the new access token, or null when
 * no refresh token is stored or refresh is impossible.
 */
async function performRefresh(userId: string): Promise<string | null> {
  const inFlight = refreshInFlight.get(userId);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    const connection = await GitHubConnection.findOne({ user: userId }).select(
      "+accessToken +refreshToken"
    );

    if (!connection?.refreshToken) {
      return null;
    }

    let refreshToken: string;
    try {
      refreshToken = decryptToken(connection.refreshToken);
    } catch {
      return null;
    }

    const tokenData = await GitHubClient.refreshAccessToken(refreshToken);

    if (!tokenData.access_token) {
      return null;
    }

    const accessTokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;
    const refreshTokenExpiresAt = tokenData.refresh_token_expires_in
      ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
      : null;

    const update: Record<string, unknown> = {
      accessToken: encryptToken(tokenData.access_token),
      accessTokenExpiresAt: accessTokenExpiresAt || null,
      refreshTokenExpiresAt: refreshTokenExpiresAt || null,
    };
    if (tokenData.refresh_token) {
      update.refreshToken = encryptToken(tokenData.refresh_token);
    }

    await GitHubConnection.updateOne({ user: userId }, { $set: update });

    return tokenData.access_token;
  })();

  refreshInFlight.set(userId, promise);

  try {
    return await promise;
  } finally {
    refreshInFlight.delete(userId);
  }
}

/**
 * Returns a GitHubService for the user, transparently refreshing the stored
 * token when it is close to expiry or has expired. The service also carries a
 * refresh hook so a single 401 from the GitHub API is retried with a fresh
 * token instead of failing.
 */
export async function getGitHubServiceForUser(
  userId: string
): Promise<GitHubService> {
  const connection = await getConnection(userId);

  let accessToken: string | null = null;
  try {
    accessToken = decryptToken(connection.accessToken);
  } catch {
    throw new AppError(
      "GitHub connection token is corrupted. Please disconnect and reconnect your GitHub account.",
      502
    );
  }

  const expired =
    !!connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - Date.now() <
      REFRESH_BUFFER_MS;

  const refreshStillValid =
    !connection.refreshTokenExpiresAt ||
    connection.refreshTokenExpiresAt.getTime() > Date.now();

  if (expired) {
    if (connection.refreshToken && refreshStillValid) {
      try {
        const refreshed = await performRefresh(userId);
        if (refreshed) {
          accessToken = refreshed;
        } else {
          throw new Error("no refreshed token");
        }
      } catch {
        throw new AppError(
          "Your GitHub access token has expired and could not be refreshed automatically. Please disconnect and reconnect your GitHub account.",
          502
        );
      }
    } else if (connection.refreshToken) {
      throw new AppError(
        "Your GitHub access token has expired and its refresh token is also expired. Please disconnect and reconnect your GitHub account.",
        502
      );
    }
  }

  return new GitHubService(accessToken, () => performRefresh(userId));
}