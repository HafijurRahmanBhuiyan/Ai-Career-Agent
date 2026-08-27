export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  email: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  private: boolean;
  fork: boolean;
  default_branch: string;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  size: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

export interface GitHubLanguages {
  [language: string]: number;
}

export interface GitHubReadme {
  name: string;
  path: string;
  content: string;
  encoding: string;
}

export interface GitHubPaginatedResponse<T> {
  data: T[];
  Link?: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubOAuthState {
  userId: string;
  createdAt: number;
  used: boolean;
}
