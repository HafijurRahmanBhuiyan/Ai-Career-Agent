import axios, { AxiosInstance } from "axios";

export const LINKEDIN_OAUTH_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_OAUTH_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_API_BASE = "https://api.linkedin.com";

const DEFAULT_LINKEDIN_API_VERSION = "202605";

export const DEFAULT_SCOPE = "openid profile email w_member_social";

/** Centralized, overridable configuration for the LinkedIn API version (YYYYMM). */
export function getLinkedInApiVersion(): string {
  return process.env.LINKEDIN_API_VERSION || DEFAULT_LINKEDIN_API_VERSION;
}

export function getLinkedInScopes(): string {
  return process.env.LINKEDIN_SCOPES || DEFAULT_SCOPE;
}

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface LinkedInUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  locale?: string;
}

export interface CreatePostInput {
  authorUrn: string;
  commentary: string;
}

export interface CreatePostResult {
  postUrn: string;
}

export class LinkedInError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "LinkedInError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const p = payload as {
      message?: string;
      errors?: Array<{ message?: string; code?: string }>;
      serviceErrorCode?: number;
      status?: string;
    };
    if (typeof p.message === "string" && p.message) return p.message;
    if (Array.isArray(p.errors) && p.errors[0]?.message) {
      return `${p.errors[0].message}`;
    }
  }
  return "LinkedIn API request failed";
}

export class LinkedInClient {
  private api: AxiosInstance;

  constructor(accessToken: string) {
    this.api = axios.create({
      baseURL: LINKEDIN_API_BASE,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Linkedin-Version": getLinkedInApiVersion(),
        "X-Restli-Protocol-Version": "2.0.0",
      },
      timeout: 20000,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
    });
  }

  static getOAuthAuthorizeUrl(state: string): string {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const callbackUrl = process.env.LINKEDIN_CALLBACK_URL || process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !callbackUrl) {
      throw new Error("LinkedIn OAuth credentials are not configured");
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: getLinkedInScopes(),
      state,
    });

    return `${LINKEDIN_OAUTH_AUTH_URL}?${params.toString()}`;
  }

  static async exchangeCodeForToken(code: string): Promise<LinkedInTokenResponse> {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const callbackUrl = process.env.LINKEDIN_CALLBACK_URL || process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new Error("LinkedIn OAuth credentials are not configured");
    }

    const response = await axios.post<LinkedInTokenResponse>(
      LINKEDIN_OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 20000,
        validateStatus: (status) => status >= 200 && status < 300,
      }
    );

    return response.data;
  }

  static async refreshAccessToken(refreshToken: string): Promise<LinkedInTokenResponse> {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("LinkedIn OAuth credentials are not configured");
    }

    const response = await axios.post<LinkedInTokenResponse>(
      LINKEDIN_OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 20000,
        validateStatus: (status) => status >= 200 && status < 300,
      }
    );

    return response.data;
  }

  async getUserInfo(): Promise<LinkedInUserInfo> {
    const response = await this.api.get<LinkedInUserInfo>("/v2/userinfo");
    if (response.status === 404) {
      throw new LinkedInError("LinkedIn profile could not be retrieved", 404);
    }
    return response.data;
  }

  async createTextPost(input: CreatePostInput): Promise<CreatePostResult> {
    const payload = {
      author: input.authorUrn,
      commentary: input.commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    const response = await this.api.post("/rest/posts", payload, {
      validateStatus: (status) => status === 201 || status === 200 || status === 204,
    });

    if (response.status !== 201 && response.status !== 200) {
      throw new LinkedInError("LinkedIn did not confirm post creation", 502);
    }

    const postUrn = response.headers["x-restli-id"] as string | undefined;
    if (!postUrn || !postUrn.startsWith("urn:li:")) {
      throw new LinkedInError(
        "LinkedIn post was created but no external post identifier was returned",
        502
      );
    }

    return { postUrn };
  }
}

/** Build a person URN from a LinkedIn member id (`sub` from /v2/userinfo). */
export function toPersonUrn(memberId: string): string {
  return `urn:li:person:${memberId}`;
}

/**
 * Build a publicly viewable post URL from a post URN. LinkedIn exposes a post
 * at https://www.linkedin.com/feed/update/{postUrnWithoutSchemePrefix}. Falls
 * back to a URN-shaped string (or null) when the URN has no post id to use.
 */
export function toLinkedInPostUrl(postUrn: string): string | null {
  if (!postUrn || !postUrn.includes(":")) return postUrn || null;
  const colonId = postUrn.split(":").pop();
  const id = colonId && colonId.includes("(") ? colonId.split("(")[0] : colonId;
  if (!id) return null;
  return `https://www.linkedin.com/feed/update/${id}`;
}
