import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import GitHubRepositoryModel from "../src/models/GitHubRepository";
import ProjectAnalysis from "../src/models/ProjectAnalysis";
import LinkedInConnection from "../src/models/LinkedInConnection";
import LinkedInDraft from "../src/models/LinkedInDraft";
import { encryptToken } from "../src/utils/encryption";

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

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

let repoSeq = 0;

const makeRepo = async (
  userId: string,
  overrides: Record<string, unknown> = {}
) => {
  return GitHubRepositoryModel.create({
    user: userId,
    githubRepositoryId: ++repoSeq,
    name: `repo${repoSeq}`,
    fullName: `user/repo${repoSeq}`,
    description: "A test repo",
    htmlUrl: `https://github.com/user/repo${repoSeq}`,
    private: false,
    fork: false,
    defaultBranch: "main",
    language: "TypeScript",
    topics: ["test"],
    stars: 5,
    forks: 2,
    size: 1024,
    createdAtGithub: new Date("2024-01-01T00:00:00Z"),
    updatedAtGithub: new Date("2024-01-02T00:00:00Z"),
    pushedAtGithub: new Date("2024-01-03T00:00:00Z"),
    ...overrides,
  });
};

const makeAnalysis = async (userId: string, repoId: string) => {
  return ProjectAnalysis.create({
    user: userId,
    githubRepository: repoId,
    projectSummary: "A full-stack task management app.",
    problemStatement: "Teams need a shared task workspace.",
    keyFeatures: ["Real-time updates"],
    technologies: ["React", "Node.js"],
    programmingLanguages: ["TypeScript"],
    frameworks: ["React"],
    databases: ["MongoDB"],
    tools: ["Docker"],
    cloudServices: [],
    architecture: "Client-server",
    developmentHighlights: ["TDD"],
    skillsDemonstrated: ["Full-stack development"],
    difficultyLevel: "Intermediate",
    developerRole: "Full-Stack Developer",
    resumeDescription: "Built a task management platform.",
    linkedinDescription: "I built a full-stack task management app that teams love.",
    suggestedTags: ["task-management"],
    aiModel: "test-model",
    promptVersion: "test-v1",
    analyzedAt: new Date(),
  });
};

const seedConnection = async (userId: string) => {
  return LinkedInConnection.create({
    user: userId,
    linkedinMemberId: "member-123",
    linkedinProfileUrn: "urn:li:person:member-123",
    encryptedAccessToken: encryptToken("linkedin-access-token-123"),
    encryptedRefreshToken: null,
    tokenExpiry: new Date(Date.now() + 3600 * 1000),
    scopes: "openid profile email w_member_social",
    isActive: true,
    connectedAt: new Date(),
  });
};

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
  repoSeq = 0;
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
  };
}

describe("M16b GitHub-page LinkedIn preview + publish workflow", () => {
  test("preview and publish endpoints require auth", async () => {
    const preview = await request(app).get("/api/github/repositories/1/linkedin-preview");
    expect(preview.status).toBe(401);
    const publish = await request(app)
      .post("/api/github/repositories/1/linkedin-draft/publish")
      .send({ content: "hello" });
    expect(publish.status).toBe(401);
  });

  test("preview rejects a repository that is not approved (403)", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA); // not approved
    await makeAnalysis(idA, String(repo._id));
    const res = await request(app)
      .get(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-preview`)
      .set(authorize(tokenA));
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("approved");
  });

  test("preview returns the AI generated linkedinDescription for an approved repo", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA, { approvedForProfessionalUse: true });
    await makeAnalysis(idA, String(repo._id));
    const res = await request(app)
      .get(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-preview`)
      .set(authorize(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
    expect(res.body.content).toContain("full-stack task management app");
    expect(res.body.draft).toBeNull();
  });

  test("publish rejects an unapproved repository (403)", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA); // not approved
    const res = await request(app)
      .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/publish`)
      .set(authorize(tokenA))
      .send({ content: "This should never be posted" });
    expect(res.status).toBe(403);
    expect(await LinkedInDraft.countDocuments({})).toBe(0);
  });

  test("publish rejects empty/whitespace-only content", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA, { approvedForProfessionalUse: true });
    const res = await request(app)
      .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/publish`)
      .set(authorize(tokenA))
      .send({ content: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("content");
  });

  test("publish rejects when LinkedIn is not connected (400)", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA, { approvedForProfessionalUse: true });
    await makeAnalysis(idA, String(repo._id));
    const res = await request(app)
      .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/publish`)
      .set(authorize(tokenA))
      .send({ content: "A nice post" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("LinkedIn not connected");
    expect(await LinkedInDraft.countDocuments({})).toBe(0);
  });

  test("publish is scoped to the repository owner (404 for another user)", async () => {
    const { tokenA, idA, tokenB } = await installUsers();
    const repo = await makeRepo(idA, { approvedForProfessionalUse: true });
    await seedConnection(idA);
    await makeAnalysis(idA, String(repo._id));
    const res = await request(app)
      .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/publish`)
      .set(authorize(tokenB))
      .send({ content: "Not mine" });
    expect(res.status).toBe(404);
  });

  test("publishes exact post content and persists post id + url + repository", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA, { approvedForProfessionalUse: true });
    await makeAnalysis(idA, String(repo._id));
    await seedConnection(idA);
    getMock().createTextPost.mockImplementation(async () => ({
      postUrn: "urn:li:share:repo-post-77",
    }));

    const content = "My carefully reviewed post body with #hashtags";
    const res = await request(app)
      .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/publish`)
      .set(authorize(tokenA))
      .send({ content });

    expect(res.status).toBe(200);
    expect(res.body.posted).toBe(true);
    expect(res.body.postUrn).toBe("urn:li:share:repo-post-77");
    expect(res.body.postUrl).toBe("https://www.linkedin.com/feed/update/repo-post-77");

    const draft = await LinkedInDraft.findOne({ user: idA }).select(
      "+linkedinPostUrn +linkedinPostUrl"
    );
    expect(draft).toBeTruthy();
    expect(draft!.body).toBe(content);
    expect(draft!.status).toBe("published");
    expect(draft!.publishedAt).toBeTruthy();
    expect(String(draft!.repository)).toBe(String(repo._id));
    expect(draft!.linkedinPostUrn).toBe("urn:li:share:repo-post-77");
    expect(draft!.linkedinPostUrl).toBe("https://www.linkedin.com/feed/update/repo-post-77");

    const preview = await request(app)
      .get(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-preview`)
      .set(authorize(tokenA));
    expect(preview.status).toBe(200);
    expect(preview.body.content).toBe(content);
    expect(preview.body.draft.status).toBe("published");
    expect(preview.body.draft.linkedinPostUrl).toBe(
      "https://www.linkedin.com/feed/update/repo-post-77"
    );
  });

  test("reports a LinkedIn API failure as an error and records publish_failed", async () => {
    const { tokenA, idA } = await installUsers();
    const repo = await makeRepo(idA, { approvedForProfessionalUse: true });
    await makeAnalysis(idA, String(repo._id));
    await seedConnection(idA);
    getMock().createTextPost.mockImplementation(async () => {
      throw new Error("Too many requests");
    });

    const res = await request(app)
      .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/publish`)
      .set(authorize(tokenA))
      .send({ content: "This may fail" });

    expect([400, 500]).toContain(res.status);
    const failed = await LinkedInDraft.findOne({ user: idA });
    expect(failed!.status).toBe("publish_failed");
    expect(failed!.publishErrorCode).toBe("UNKNOWN");
  });
});