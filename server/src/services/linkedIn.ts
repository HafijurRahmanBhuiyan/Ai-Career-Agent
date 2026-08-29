import { Types } from "mongoose";
import LinkedInConnection from "../models/LinkedInConnection";
import LinkedInDraft from "../models/LinkedInDraft";
import { AppError } from "../middleware/errorHandler";
import {
  LinkedInClient,
  LinkedInError,
  getLinkedInScopes,
  toPersonUrn,
  toLinkedInPostUrl,
} from "../integrations/linkedin/linkedinClient";
import { generateOAuthState } from "../utils/oauthState";
import { encryptToken, decryptToken } from "../utils/encryption";

const PUBLISH_ERROR_MESSAGE_MAX = 400;

function safeTokenError(preferred: string, fallback: string): string {
  if (typeof preferred === "string" && preferred.trim().length > 0) {
    return preferred.slice(0, PUBLISH_ERROR_MESSAGE_MAX);
  }
  return fallback.slice(0, PUBLISH_ERROR_MESSAGE_MAX);
}

function describeLinkedInError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof LinkedInError) {
    const message = safeTokenError(error.message, "LinkedIn API request failed");
    const code = error.code || `HTTP_${error.statusCode}`;
    const retryable =
      error.statusCode === 429 ||
      error.statusCode === 500 ||
      error.statusCode === 503;
    return { code, message, retryable };
  }
  if (error instanceof AppError) {
    return { code: "APP", message: error.message.slice(0, PUBLISH_ERROR_MESSAGE_MAX), retryable: false };
  }
  const generic = error instanceof Error ? error.message : "Unknown error";
  return { code: "UNKNOWN", message: generic.slice(0, PUBLISH_ERROR_MESSAGE_MAX), retryable: false };
}

export class LinkedInService {
  getAuthorizeUrl(userId: string): { authorizeUrl: string; state: string } {
    const state = generateOAuthState(userId);
    const authorizeUrl = LinkedInClient.getOAuthAuthorizeUrl(state);
    return { authorizeUrl, state };
  }

  async completeConnection(userId: string, code: string): Promise<void> {
    const tokenResponse = await LinkedInClient.exchangeCodeForToken(code);

    if (!tokenResponse.access_token) {
      throw new AppError("Failed to obtain LinkedIn access token", 400);
    }

    const client = new LinkedInClient(tokenResponse.access_token);
    let userInfo;
    try {
      userInfo = await client.getUserInfo();
    } catch (error) {
      throw new AppError("Failed to fetch LinkedIn profile", 502);
    }

    if (!userInfo.sub) {
      throw new AppError(
        "LinkedIn did not return a member identifier for this account",
        502
      );
    }

    const now = Date.now();
    const expiresInMs = (tokenResponse.expires_in || 3600) * 1000;

    const encryptedAccess = encryptToken(tokenResponse.access_token);
    const encryptedRefresh = tokenResponse.refresh_token
      ? encryptToken(tokenResponse.refresh_token)
      : null;

    await LinkedInConnection.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        linkedinMemberId: userInfo.sub,
        linkedinProfileUrn: toPersonUrn(userInfo.sub),
        displayName: userInfo.name || `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim() || null,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry: new Date(now + expiresInMs),
        scopes: tokenResponse.scope || getLinkedInScopes(),
        isActive: true,
        connectedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  async disconnect(userId: string): Promise<void> {
    const connection = await LinkedInConnection.findOneAndDelete({ user: userId });
    if (!connection) {
      throw new AppError("LinkedIn account not connected", 404);
    }
  }

  async getStatus(userId: string): Promise<Record<string, unknown>> {
    const connection = await LinkedInConnection.findOne({ user: userId });

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      linkedin: {
        memberId: connection.linkedinMemberId,
        profileUrn: connection.linkedinProfileUrn,
        displayName: connection.displayName,
        isActive: connection.isActive,
        connectedAt: connection.connectedAt,
        tokenExpiry: connection.tokenExpiry,
        lastUsedAt: connection.lastUsedAt,
      },
    };
  }

  private async getAccessToken(userId: string): Promise<string> {
    const connection = await LinkedInConnection.findOne({ user: userId }).select(
      "+encryptedAccessToken +encryptedRefreshToken"
    );

    if (!connection) {
      throw new AppError("LinkedIn not connected", 400);
    }

    if (connection.isActive !== false) {
      const accessToken = decryptToken(connection.encryptedAccessToken);
      if (!connection.tokenExpiry || connection.tokenExpiry.getTime() > Date.now()) {
        return accessToken;
      }
      if (connection.encryptedRefreshToken) {
        const refreshToken = decryptToken(connection.encryptedRefreshToken);
        try {
          const refreshed = await LinkedInClient.refreshAccessToken(refreshToken);
          if (refreshed.access_token) {
            const now = Date.now();
            const expiresInMs = (refreshed.expires_in || 3600) * 1000;
            connection.encryptedAccessToken = encryptToken(refreshed.access_token);
            connection.encryptedRefreshToken = refreshed.refresh_token
              ? encryptToken(refreshed.refresh_token)
              : connection.encryptedRefreshToken;
            connection.tokenExpiry = new Date(now + expiresInMs);
            await connection.save();
            return refreshed.access_token;
          }
        } catch {
          throw new AppError(
            "LinkedIn access token expired and could not be refreshed. Reconnect your LinkedIn account.",
            401
          );
        }
      }
      throw new AppError(
        "LinkedIn access token expired. Reconnect your LinkedIn account.",
        401
      );
    }

    throw new AppError("LinkedIn account is not active", 403);
  }

  async publishDraft(
    userId: string,
    draftId: string
  ): Promise<Record<string, unknown>> {
    if (!Types.ObjectId.isValid(draftId)) {
      throw new AppError("Invalid draft ID", 404);
    }

    const draft = await LinkedInDraft.findOne({ _id: draftId, user: userId });
    if (!draft) {
      throw new AppError("Draft not found", 404);
    }
    if (draft.status === "archived") {
      throw new AppError("Archived drafts cannot be published", 400);
    }
    if (draft.status === "published") {
      throw new AppError("Draft is already published", 400);
    }
    if (draft.status !== "approved") {
      throw new AppError(
        "Only approved drafts can be published",
        400
      );
    }
    if (!draft.body || !draft.body.trim()) {
      throw new AppError("Draft has no content to publish", 400);
    }

    draft.status = "publishing";
    draft.lastPublishAttemptAt = new Date();
    draft.publishErrorCode = null;
    draft.publishErrorMessageSafe = null;
    await draft.save();

    const connection = await LinkedInConnection.findOne({
      user: userId,
    }).select("+encryptedAccessToken +encryptedRefreshToken");

    if (!connection) {
      draft.status = "publish_failed";
      draft.publishErrorCode = "NOT_CONNECTED";
      draft.publishErrorMessageSafe = "LinkedIn is not connected";
      await draft.save();
      return { draft, published: false };
    }

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(userId);
    } catch (error) {
      const { code, message } = describeLinkedInError(error);
      draft.status = "publish_failed";
      draft.publishErrorCode = code;
      draft.publishErrorMessageSafe = message;
      await draft.save();
      return { draft, published: false };
    }

    connection.lastUsedAt = new Date();
    await connection.save();

    const client = new LinkedInClient(accessToken);
    const commentary = [draft.hook, draft.body].filter(Boolean).join("\n\n").trim();

    let result;
    try {
      result = await client.createTextPost({
        authorUrn: connection.linkedinProfileUrn,
        commentary,
      });
    } catch (error) {
      const { code, message } = describeLinkedInError(error);
      draft.status = "publish_failed";
      draft.publishErrorCode = code;
      draft.publishErrorMessageSafe = message;
      await draft.save();
      return { draft, published: false };
    }

    draft.status = "published";
    draft.publishedAt = new Date();
    draft.linkedinPostUrn = result.postUrn;
    draft.linkedinPostUrl = toLinkedInPostUrl(result.postUrn);
    draft.lastPublishAttemptAt = new Date();
    draft.publishErrorCode = null;
    draft.publishErrorMessageSafe = null;
    await draft.save();

    return {
      draft,
      published: true,
      postUrn: result.postUrn,
      postUrl: draft.linkedinPostUrl || toLinkedInPostUrl(result.postUrn),
    };
  }
}

