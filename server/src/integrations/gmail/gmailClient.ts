import axios, { AxiosInstance } from "axios";

const GMAIL_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

const DEFAULT_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface GmailTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
}

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
}

export interface GmailHeader {
  name?: string;
  value?: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

export interface GmailMessageFull {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailMessagePart;
}

export function getGmailScopes(): string {
  return process.env.GOOGLE_GMAIL_SCOPES || DEFAULT_SCOPE;
}

export class GmailClient {
  private api: AxiosInstance;

  constructor(accessToken?: string) {
    this.api = axios.create({
      baseURL: GMAIL_API_BASE,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      timeout: 15000,
    });
  }

  static getOAuthAuthorizeUrl(state: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
      throw new Error("Google OAuth credentials are not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: getGmailScopes(),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `${GMAIL_OAUTH_AUTH_URL}?${params.toString()}`;
  }

  static async exchangeCodeForToken(code: string): Promise<GmailTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new Error("Google OAuth credentials are not configured");
    }

    const response = await axios.post<GmailTokenResponse>(
      GMAIL_OAUTH_TOKEN_URL,
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );

    return response.data;
  }

  static async refreshAccessToken(refreshToken: string): Promise<GmailTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials are not configured");
    }

    const response = await axios.post<GmailTokenResponse>(
      GMAIL_OAUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );

    return response.data;
  }

  async getProfile(): Promise<GmailProfile> {
    const response = await this.api.get<GmailProfile>("/users/me/profile");
    return response.data;
  }

  async listMessages(
    maxResults: number,
    query?: string
  ): Promise<{ id: string; threadId: string }[]> {
    const response = await this.api.get<{
      messages?: { id: string; threadId?: string }[];
      resultSizeEstimate?: number;
    }>("/users/me/messages", {
      params: {
        maxResults: Math.max(1, Math.min(maxResults, 100)),
        ...(query ? { q: query } : {}),
      },
    });
    return (response.data.messages || []).map((m) => ({
      id: m.id,
      threadId: m.threadId || m.id,
    }));
  }

  async getMessageMeta(id: string): Promise<GmailMessageMeta> {
    const response = await this.api.get<GmailMessageFull>(
      `/users/me/messages/${id}`,
      { params: { format: "metadata" } }
    );

    const headers = response.data.payload?.headers || [];
    const get = (name: string) =>
      headers.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value;

    return {
      id: response.data.id,
      threadId: response.data.threadId,
      snippet: response.data.snippet,
      subject: get("subject"),
      from: get("from"),
      to: get("to"),
      date: get("date"),
    };
  }

  async getMessageFull(id: string): Promise<GmailMessageFull> {
    const response = await this.api.get<GmailMessageFull>(
      `/users/me/messages/${id}`,
      { params: { format: "full" } }
    );
    return response.data;
  }
}
