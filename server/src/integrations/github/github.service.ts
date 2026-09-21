import { GitHubClient } from "./githubClient";
import { AppError } from "../../middleware/errorHandler";
import {
  GitHubRepository,
  GitHubLanguages,
  GitHubReadme,
  GitHubUser,
} from "./github.types";

function validateFullName(fullName: string): [string, string] {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new AppError(
      "Invalid repository full name. Expected format: owner/repo",
      400
    );
  }
  return [owner, repo];
}

export class GitHubService {
  private client: GitHubClient;

  constructor(
    accessToken: string,
    tokenRefresh?: () => Promise<string | null>
  ) {
    this.client = new GitHubClient(accessToken, tokenRefresh);
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.client.getAuthenticatedUser();
  }

  async getUserRepositories(
    page = 1,
    perPage = 30
  ): Promise<GitHubRepository[]> {
    return this.client.getUserRepositories(page, perPage);
  }

  async getRepository(fullName: string): Promise<GitHubRepository> {
    const [owner, repo] = validateFullName(fullName);
    return this.client.getRepository(owner, repo);
  }

  async getRepositoryLanguages(
    fullName: string
  ): Promise<GitHubLanguages> {
    const [owner, repo] = validateFullName(fullName);
    return this.client.getRepositoryLanguages(owner, repo);
  }

  async getRepositoryReadme(
    fullName: string
  ): Promise<GitHubReadme> {
    const [owner, repo] = validateFullName(fullName);
    return this.client.getRepositoryReadme(owner, repo);
  }
}
