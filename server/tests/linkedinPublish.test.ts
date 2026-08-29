import request from "supertest";
import { Types } from "mongoose";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import LinkedInConnection from "../src/models/LinkedInConnection";
import LinkedInDraft from "../src/models/LinkedInDraft";
import { LinkedInError } from "../src/integrations/linkedin/linkedinClient";
import { LinkedInService } from "../src/services/linkedIn";
import { generateOAuthState } from "../src/utils/oauthState";
import { encryptToken, decryptToken } from "../src/utils/encryption";

jest.mock("../src/integrations/linkedin/linkedinClient", () => {
  const actual = jest.requireActual(
    "../src/integrations/linkedin/linkedinClient"
  ) as typeof import("../src/integrations/linkedin/linkedinClient");

  const mock = {
    getUserInfo: jest.fn(),
    createTextPost: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    refreshAccessToken: jest.fn(),
  };

  class MockLinkedInClient {
    accessToken: string;
    constructor(accessToken: string) {
      this.accessToken = accessToken;
    }
    static getOAuthAuthorizeUrl(state: string) {
      return `https://linkedin.mock/authorize?state=${state}`;
    }
    static exchangeCodeForToken(code: string) {
      return mock.exchangeCodeForToken(code);
    }
    static refreshAccessToken(token: string) {
      return mock.refreshAccessToken(token);
    }
    async getUserInfo() {
      return mock.getUserInfo();
    }
    async createTextPost(input: { authorUrn: string; commentary: string }) {
      return mock.createTextPost(input);
    }
  }

  return {
    LINKEDIN_OAUTH_AUTH_URL: actual.LINKEDIN_OAUTH_AUTH_URL,
    LINKEDIN_OAUTH_TOKEN_URL: actual.LINKEDIN_OAUTH_TOKEN_URL,
    LINKEDIN_API_BASE: actual.LINKEDIN_API_BASE,
    getLinkedInApiVersion: actual.getLinkedInApiVersion,
    getLinkedInScopes: actual.getLinkedInScopes,
    LinkedInError: actual.LinkedInError,
    toPersonUrn: actual.toPersonUrn,
    toLinkedInPostUrl: actual.toLinkedInPostUrl,
    LinkedInClient: MockLinkedInClient,
    __getMock: () => mock,
  };
});

type LinkedInMock = {
  getUserInfo: jest.Mock;
  createTextPost: jest.Mock;
  exchangeCodeForToken: jest.Mock;
  refreshAccessToken: jest.Mock;
};

const getMock = (): LinkedInMock =>
  (
    jest.requireMock("../src/integrations/linkedin/linkedinClient") as {
      __getMock: () => LinkedInMock;
    }
  ).__getMock();

const service = new LinkedInService();
const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "d".repeat(64);
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  process.env.LINKEDIN_CLIENT_ID = "test-client-id";
  process.env.LINKEDIN_CLIENT_SECRET = "test-client-secret";
  process.env.LINKEDIN_CALLBACK_URL = "http://localhost:5001/api/linkedin/callback";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  for (const fn of Object.values(getMock())) {
    fn.mockReset();
  }
});

async function installUsers() {
  const a = await registerUser();
  const b = await registerSecondUser();
  return {
    tokenA: a.token,
    idA: (a.user as { id: string }).id,
    tokenB: b.token,
    idB: (b.user as { id: string }).id,
  };
}

async function seedConnection(userId: string, memberId = "member-123") {
  return LinkedInConnection.create({
    user: userId,
    linkedinMemberId: memberId,
    linkedinProfileUrn: `urn:li:person:${memberId}`,
    encryptedAccessToken: encryptToken("linkedin-access-token-123"),
    encryptedRefreshToken: null,
    tokenExpiry: new Date(Date.now() + 3600 * 1000),
    scopes: "openid profile email w_member_social",
    isActive: true,
    connectedAt: new Date(),
  });
}

async function seedApprovedDraft(userId: string, body = "A post body") {
  const evidence = new Types.ObjectId();
  return LinkedInDraft.create({
    user: userId,
    evidence,
    body,
    status: "approved",
  });
}

describe("M16 LinkedIn publishing - OAuth connection", () => {
  test("connect/status/disconnect endpoints require auth", async () => {
    const connect = await request(app).get("/api/linkedin/connect");
    expect(connect.status).toBe(401);
    const status = await request(app).get("/api/linkedin/status");
    expect(status.status).toBe(401);
    const disconnect = await request(app).post("/api/linkedin/disconnect");
    expect(disconnect.status).toBe(401);
  });

  test("connect returns an authorize URL and a state token", async () => {
    const { tokenA } = await installUsers();
    const res = await request(app).get("/api/linkedin/connect").set(authorize(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.authorizeUrl).toContain("state=");
    expect(res.body.state).toHaveLength(64);
  });

  test("status is not connected before callback", async () => {
    const { tokenA } = await installUsers();
    const res = await request(app).get("/api/linkedin/status").set(authorize(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  test("status is scoped per user (cross-user sees disconnected)", async () => {
    const { tokenA, idA, tokenB } = await installUsers();
    await seedConnection(idA);
    getMock().getUserInfo.mockImplementation(async () => ({ sub: "member-123" }));
    const aRes = await request(app).get("/api/linkedin/status").set(authorize(tokenA));
    expect(aRes.body.connected).toBe(true);
    const bRes = await request(app).get("/api/linkedin/status").set(authorize(tokenB));
    expect(bRes.body.connected).toBe(false);
  });

  test("callback stores encrypted tokens and marks connected", async () => {
    const { tokenA, idA } = await installUsers();
    const state = generateOAuthState(idA);
    getMock().exchangeCodeForToken.mockImplementation(async () => ({
      access_token: "fresh-access",
      expires_in: 3600,
      scope: "openid profile email w_member_social",
    }));
    getMock().getUserInfo.mockImplementation(async () => ({
      sub: "member-abc",
      name: "Test User",
    }));

    const res = await request(app)
      .get(`/api/linkedin/callback?code=abc&state=${state}`)
      .set(authorize(tokenA));
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("linkedin=connected");

    const conn = await LinkedInConnection.findOne({ user: idA }).select(
      "+encryptedAccessToken +encryptedRefreshToken"
    );
    expect(conn).toBeTruthy();
    expect(conn!.linkedinMemberId).toBe("member-abc");
    expect(conn!.linkedinProfileUrn).toBe("urn:li:person:member-abc");
    expect(decryptToken(conn!.encryptedAccessToken)).toBe("fresh-access");
  });

  test("callback rejects missing code/state (400)", async () => {
    const { tokenA } = await installUsers();
    const res = await request(app)
      .get("/api/linkedin/callback")
      .set(authorize(tokenA));
    expect(res.status).toBe(400);
  });

  test("callback rejects an invalid state (400)", async () => {
    const { tokenA } = await installUsers();
    const res = await request(app)
      .get("/api/linkedin/callback?code=abc&state=not-a-valid-state")
      .set(authorize(tokenA));
    expect(res.status).toBe(400);
  });

  test("disconnect removes the connection", async () => {
    const { tokenA, idA } = await installUsers();
    await seedConnection(idA);
    const res = await request(app)
      .post("/api/linkedin/disconnect")
      .set(authorize(tokenA));
    expect(res.status).toBe(200);
    expect(await LinkedInConnection.findOne({ user: idA })).toBeNull();
  });

  test("disconnect is cross-user safe (404 for another user)", async () => {
    const { idA, tokenB } = await installUsers();
    await seedConnection(idA);
    const res = await request(app)
      .post("/api/linkedin/disconnect")
      .set(authorize(tokenB));
    expect(res.status).toBe(404);
  });
});

describe("M16 LinkedIn publishing - publishDraft service", () => {
  test("publishes an approved draft to a real post URN", async () => {
    const { idA } = await installUsers();
    await seedConnection(idA);
    getMock().createTextPost.mockImplementation(async () => ({
      postUrn: "urn:li:share:post-1",
    }));
    const draft = await seedApprovedDraft(idA, "My body");

    const result = await service.publishDraft(idA, String(draft._id));
    expect(result.published).toBe(true);
    expect(result.postUrn).toBe("urn:li:share:post-1");

    const updated = await LinkedInDraft.findById(draft._id);
    expect(updated!.status).toBe("published");
    expect(updated!.linkedinPostUrn).toBe("urn:li:share:post-1");
    expect(updated!.publishedAt).toBeTruthy();
    expect(updated!.publishErrorCode).toBeNull();
  });

  test("returns 400 when draft is not approved", async () => {
    const { idA } = await installUsers();
    const evidence = new Types.ObjectId();
    const draft = await LinkedInDraft.create({
      user: idA,
      evidence,
      body: "body",
      status: "draft",
    });
    await expect(service.publishDraft(idA, String(draft._id))).rejects.toThrow(
      /approved/
    );
    const reloaded = await LinkedInDraft.findById(draft._id);
    expect(reloaded!.status).toBe("draft");
  });

  test("returns 400 when draft is already published", async () => {
    const { idA } = await installUsers();
    const evidence = new Types.ObjectId();
    const draft = await LinkedInDraft.create({
      user: idA,
      evidence,
      body: "body",
      status: "published",
    });
    await expect(service.publishDraft(idA, String(draft._id))).rejects.toThrow(
      /already published/
    );
  });

  test("returns 400 when draft is archived", async () => {
    const { idA } = await installUsers();
    const evidence = new Types.ObjectId();
    const draft = await LinkedInDraft.create({
      user: idA,
      evidence,
      body: "body",
      status: "archived",
    });
    await expect(service.publishDraft(idA, String(draft._id))).rejects.toThrow(
      /archived/i
    );
  });

  test("marks publish_failed when not connected, preserving draft", async () => {
    const { idA } = await installUsers();
    const draft = await seedApprovedDraft(idA);
    const result = await service.publishDraft(idA, String(draft._id));
    expect(result.published).toBe(false);
    const updated = await LinkedInDraft.findById(draft._id);
    expect(updated!.status).toBe("publish_failed");
    expect(updated!.publishErrorCode).toBe("NOT_CONNECTED");
    expect(updated!.body).toBe(draft.body);
  });

  test("marks publish_failed on a retryable API error and preserves draft", async () => {
    const { idA } = await installUsers();
    await seedConnection(idA);
    getMock().createTextPost.mockImplementation(async () => {
      throw new LinkedInError("Too many requests", 429);
    });
    const draft = await seedApprovedDraft(idA, "body");

    const result = await service.publishDraft(idA, String(draft._id));
    expect(result.published).toBe(false);
    const updated = await LinkedInDraft.findById(draft._id);
    expect(updated!.status).toBe("publish_failed");
    expect(updated!.publishErrorCode).toBe("HTTP_429");
    expect(updated!.publishErrorMessageSafe).toContain("Too many requests");
    expect(updated!.body).toBe(draft.body);
  });

  test("does not mutate another user's draft (404)", async () => {
    const { idA, idB } = await installUsers();
    const draft = await seedApprovedDraft(idA);
    await expect(service.publishDraft(idB, String(draft._id))).rejects.toThrow(
      /not found/
    );
  });

  test("returns 404 for an invalid draft id", async () => {
    const { idA } = await installUsers();
    await expect(service.publishDraft(idA, "not-an-objectid")).rejects.toThrow(
      /Invalid draft ID/
    );
  });
});

describe("M16 LinkedIn publishing - publish API endpoint", () => {
  test("endpoint requires auth", async () => {
    const res = await request(app).post("/api/projects/linkedin-drafts/abc/publish");
    expect(res.status).toBe(401);
  });

  test("publishes a draft through the API using the connected account", async () => {
    const { tokenA, idA } = await installUsers();
    await seedConnection(idA);
    getMock().createTextPost.mockImplementation(async () => ({
      postUrn: "urn:li:share:api-post",
    }));
    const draft = await seedApprovedDraft(idA, "body via api");

    const res = await request(app)
      .post(`/api/projects/linkedin-drafts/${draft._id}/publish`)
      .set(authorize(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.posted).toBe(true);
    expect(res.body.postUrn).toBe("urn:li:share:api-post");

    const updated = await LinkedInDraft.findById(draft._id);
    expect(updated!.status).toBe("published");
  });
});
