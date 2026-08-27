import { GitHubClient } from "./githubClient";
import {
  GitHubRepository,
  GitHubLanguages,
  GitHubReadme,
  GitHubUser,
} from "./github.types";

export class GitHubService {
  private client: GitHubClient;

  constructor(accessToken: string) {
    this.client = new GitHubClient(accessToken);
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
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository full name. Expected format: owner/repo");
    }
    return this.client.getRepository(owner, repo);
  }

  async getRepositoryLanguages(
    fullName: string
  ): Promise<GitHubLanguages> {
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository full name. Expected format: owner/repo");
    }
    return this.client.getRepositoryLanguages(owner, repo);
  }

  async getRepositoryReadme(
    fullName: string
  ): Promise<GitHubReadme> {
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository full name. Expected format: owner/repo");
    }
    return this.client.getRepositoryReadme(owner, repo);
  }
}
