import axios, { AxiosInstance, AxiosError } from "axios";
import { AppError } from "../../middleware/errorHandler";
import {
  GitHubUser,
  GitHubRepository,
  GitHubLanguages,
  GitHubReadme,
  GitHubTokenResponse,
} from "./github.types";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_OAUTH_BASE = "https://github.com";

const TOKEN_INVALID_MESSAGE =
  "Your GitHub access token is invalid or expired. Please disconnect and reconnect your GitHub account.";

function toGitHubAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as
      | { message?: unknown }
      | undefined;
    const message =
      typeof data?.message === "string" && data.message.trim()
        ? data.message.trim()
        : null;

    if (status === 401) {
      return new AppError(TOKEN_INVALID_MESSAGE, 502);
    }
    if (status === 403) {
      return new AppError(
        message ||
          "Access to this GitHub resource was denied. Check the repository permissions or reconnect GitHub.",
        403
      );
    }
    if (status === 404) {
      return new AppError(message || "Resource not found on GitHub.", 404);
    }
    if (status === 429) {
      return new AppError(
        "GitHub API rate limit exceeded. Please try again later.",
        429
      );
    }
    return new AppError(
      message || `GitHub API request failed (status ${status ?? "network error"}).`,
      502
    );
  }

  return new AppError("GitHub API request failed. Please try again.", 502);
}

function oauthErrorDescription(data: GitHubTokenResponse): string | null {
  if (!data.access_token && data.error) {
    if (data.error_description) {
      return data.error_description;
    }
    if (data.error === "bad_verification_code") {
      return "GitHub could not verify the authorization code. Please disconnect and reconnect GitHub.";
    }
    if (data.error === "bad_refresh_token") {
      return "The GitHub refresh token is no longer valid. Please disconnect and reconnect GitHub.";
    }
    return `GitHub returned an OAuth error: ${data.error}`;
  }
  return null;
}

export class GitHubClient {
  private api: AxiosInstance;
  private tokenRefresh?: () => Promise<string | null>;

  constructor(accessToken?: string, tokenRefresh?: () => Promise<string | null>) {
    this.tokenRefresh = tokenRefresh;
    this.api = axios.create({
      baseURL: GITHUB_API_BASE,
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      timeout: 15000,
    });

    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const ctx = error.config as (typeof error.config & {
          _githubTokenRetried?: boolean;
        }) | undefined;

        if (
          error?.response?.status === 401 &&
          this.tokenRefresh &&
          ctx &&
          !ctx._githubTokenRetried
        ) {
          ctx._githubTokenRetried = true;

          let newToken: string | null = null;
          try {
            newToken = await this.tokenRefresh();
          } catch {
            newToken = null;
          }

          if (newToken) {
            ctx.headers.Authorization = `Bearer ${newToken}`;
            try {
              return await this.api.request(ctx);
            } catch (retryError) {
              return Promise.reject(toGitHubAppError(retryError));
            }
          }

          return Promise.reject(
            new AppError(
              "Your GitHub access token has expired and could not be refreshed automatically. Please disconnect and reconnect your GitHub account.",
              502
            )
          );
        }

        return Promise.reject(toGitHubAppError(error));
      }
    );
  }

  static getOAuthAuthorizeUrl(state: string): string {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
      throw new Error("GitHub OAuth credentials not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: "read:user repo",
      state,
    });

    return `${GITHUB_OAUTH_BASE}/login/oauth/authorize?${params.toString()}`;
  }

  static async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AppError("GitHub OAuth credentials not configured", 503);
    }

    let response;
    try {
      response = await axios.post<GitHubTokenResponse>(
        `${GITHUB_OAUTH_BASE}/login/oauth/access_token`,
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        {
          headers: { Accept: "application/json" },
          timeout: 15000,
        }
      );
    } catch {
      throw new AppError(
        "Failed to reach the GitHub authorization server. Please try again.",
        502
      );
    }

    const oauthError = oauthErrorDescription(response.data);
    if (oauthError) {
      throw new AppError(oauthError, 400);
    }

    return response.data;
  }

  static async refreshAccessToken(
    refreshToken: string
  ): Promise<GitHubTokenResponse> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AppError("GitHub OAuth credentials not configured", 503);
    }

    let response;
    try {
      response = await axios.post<GitHubTokenResponse>(
        `${GITHUB_OAUTH_BASE}/login/oauth/access_token`,
        {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        {
          headers: { Accept: "application/json" },
          timeout: 15000,
        }
      );
    } catch {
      throw new AppError(
        "Failed to reach the GitHub authorization server while refreshing your access token. Please try again.",
        502
      );
    }

    const oauthError = oauthErrorDescription(response.data);
    if (oauthError) {
      throw new AppError(oauthError, 502);
    }

    return response.data;
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const response = await this.api.get<GitHubUser>("/user");
    return response.data;
  }

  async getUserRepositories(
    page = 1,
    perPage = 30
  ): Promise<GitHubRepository[]> {
    const response = await this.api.get<GitHubRepository[]>("/user/repos", {
      params: {
        page,
        per_page: Math.min(perPage, 100),
        sort: "updated",
        direction: "desc",
      },
    });
    return response.data;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const response = await this.api.get<GitHubRepository>(
      `/repos/${owner}/${repo}`
    );
    return response.data;
  }

  async getRepositoryLanguages(
    owner: string,
    repo: string
  ): Promise<GitHubLanguages> {
    const response = await this.api.get<GitHubLanguages>(
      `/repos/${owner}/${repo}/languages`
    );
    return response.data;
  }

  async getRepositoryReadme(
    owner: string,
    repo: string
  ): Promise<GitHubReadme> {
    const response = await this.api.get<GitHubReadme>(
      `/repos/${owner}/${repo}/readme`
    );
    return response.data;
  }
}
