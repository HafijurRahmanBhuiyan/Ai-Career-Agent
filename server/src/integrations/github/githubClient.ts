import axios, { AxiosInstance } from "axios";
import {
  GitHubUser,
  GitHubRepository,
  GitHubLanguages,
  GitHubReadme,
  GitHubTokenResponse,
} from "./github.types";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_OAUTH_BASE = "https://github.com";

export class GitHubClient {
  private api: AxiosInstance;

  constructor(accessToken?: string) {
    this.api = axios.create({
      baseURL: GITHUB_API_BASE,
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      timeout: 10000,
    });
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
      throw new Error("GitHub OAuth credentials not configured");
    }

    const response = await axios.post<GitHubTokenResponse>(
      `${GITHUB_OAUTH_BASE}/login/oauth/access_token`,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
      },
      {
        headers: { Accept: "application/json" },
        timeout: 10000,
      }
    );

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
