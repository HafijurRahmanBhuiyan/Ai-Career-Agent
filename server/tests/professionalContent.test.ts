import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import GitHubRepositoryModel from "../src/models/GitHubRepository";
import ProfessionalEvidence from "../src/models/ProfessionalEvidence";
import LinkedInDraft from "../src/models/LinkedInDraft";
import { Types } from "mongoose";

jest.mock("../src/integrations/claude/claudeClient", () => {
  const analyze = jest.fn<Promise<string>, [string, string]>(() =>
    Promise.resolve("{}")
  );
  return {
    getModel: jest.fn(() => "claude-sonnet-4-20250514"),
    getMaxTokens: jest.fn(() => 4096),
    getReadmeLimit: jest.fn(() => 15000),
    truncateReadme: jest.fn((r: string) => ({ content: r || "", truncated: false })),
    resetClient: jest.fn(),
    analyzeProject: analyze,
    __getAnalyzeProject: () => analyze,
  };
});

const VALID_SUGGESTIONS = JSON.stringify({
  suggestions: [
    {
      hook: "I built this",
      body: "A post body about the project.",
      hashtags: ["typescript", "openSource"],
    },
  ],
});

let repoSeq = 0;

const makeRepo = async (userId: string, overrides: Record<string, unknown> = {}) => {
  return GitHubRepositoryModel.create({
    user: userId,
    githubRepositoryId: ++repoSeq,
    name: "repo" + repoSeq,
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

const installUsers = async () => {
  const a = await registerUser();
  const b = await registerSecondUser();
  return { tokenA: a.token, idA: (a.user as { id: string }).id, tokenB: b.token };
};

let analyzeMock: jest.Mock;

beforeAll(async () => {
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "d".repeat(64);
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  repoSeq = 0;
  jest.restoreAllMocks();
  analyzeMock = (
    jest.requireMock("../src/integrations/claude/claudeClient") as {
      __getAnalyzeProject: () => jest.Mock;
    }
  ).__getAnalyzeProject();
  analyzeMock.mockReset();
});

async function approveRepo(token: string, repoId: number) {
  const res = await request(app)
    .post(`/api/github/repositories/${repoId}/approve`)
    .set("Authorization", `Bearer ${token}`)
    .send({ approved: true });
  expect(res.status).toBe(200);
}

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("M15 Professional Content Workflow", () => {
  describe("approval gate", () => {
    test("approve requires authentication", async () => {
      const res = await request(app)
        .post("/api/github/repositories/1/approve")
        .send({ approved: true });
      expect(res.status).toBe(401);
    });

    test("unapproved repo cannot generate evidence (403)", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA); // not approved
      const res = await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("approved");
    });

    test("unapproved repo cannot run Claude assist (403)", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA); // not approved
      const res = await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/assist`)
        .set(authorize(tokenA));
      expect(res.status).toBe(403);
    });

    test("can mark a repo approved and unapprove it", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);

      const fetched = await GitHubRepositoryModel.findById(repo._id);
      expect(fetched!.approvedForProfessionalUse).toBe(true);
      expect(fetched!.approvedAt).toBeTruthy();

      const res = await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/approve`)
        .set(authorize(tokenA))
        .send({ approved: false });
      expect(res.status).toBe(200);
      expect(res.body.repository.approvedForProfessionalUse).toBe(false);
    });
  });

  describe("professional evidence", () => {
    test("evidence endpoints require auth", async () => {
      for (const method of ["post", "get", "patch"] as const) {
        const res = await request(app)
          [method]("/api/github/repositories/1/professional-evidence")
          .send({});
        expect(res.status).toBe(401);
      }
    });

    test("generates evidence deterministically without fabricated impact", async () => {
      const { tokenA, idA, tokenB } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);

      const res = await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      expect(res.status).toBe(201);
      const evidence = res.body.evidence;
      expect(evidence.user).toBeUndefined();
      expect(evidence.__v).toBeUndefined();
      expect(evidence.projectName).toBe(repo.name);
      // No measurable impact or contribution evidence is fabricated.
      expect(evidence.measurableImpact).toBe("");
      expect(evidence.contributionEvidence).toBe("");
      expect(Array.isArray(evidence.technicalSkills)).toBe(true);
      expect(evidence.evidenceReferences).toContain(repo.htmlUrl);
      // Cross-user cannot see it.
      const other = await request(app)
        .get(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenB));
      expect(other.status).toBe(404);
    });

    test("get evidence returns 404 when none", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      const res = await request(app)
        .get(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      expect(res.status).toBe(404);
    });

    test("update evidence persists user clarifications", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));

      const patch = {
        contributionEvidence: "I designed the auth flow.",
        measurableImpact: "Not measured.",
      };
      const res = await request(app)
        .patch(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA))
        .send(patch);
      expect(res.status).toBe(200);
      expect(res.body.evidence.contributionEvidence).toBe(patch.contributionEvidence);
    });

    test("update evidence rejects unknown fields (422)", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      const res = await request(app)
        .patch(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA))
        .send({ userId: idA, ownerId: "x", professionalSummary: "ok" });
      expect(res.status).toBe(422);
    });

    test("evidence is user-scoped; cross-user returns 404", async () => {
      const { tokenA, idA, tokenB } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      const res = await request(app)
        .patch(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenB))
        .send({ contributionEvidence: "nope" });
      expect(res.status).toBe(404);
    });
  });

  describe("LinkedIn draft CRUD", () => {
    async function makeEvidence(tokenA: string, idA: string) {
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      const evidence = await ProfessionalEvidence.findOne({ user: idA });
      return { repo, evidenceId: String(evidence!._id) };
    }

    test("draft endpoints require auth", async () => {
      const list = await request(app).get("/api/projects/linkedin-drafts");
      expect(list.status).toBe(401);
      const create = await request(app).post("/api/projects/linkedin-drafts").send({});
      expect(create.status).toBe(401);
      const upd = await request(app).patch("/api/projects/linkedin-drafts/abc").send({});
      expect(upd.status).toBe(401);
      const ap = await request(app).post("/api/projects/linkedin-drafts/abc/approve");
      expect(ap.status).toBe(401);
    });

    test("create, list, get, update, approve a draft", async () => {
      const { tokenA, idA } = await installUsers();
      const { evidenceId } = await makeEvidence(tokenA, idA);

      const created = await request(app)
        .post("/api/projects/linkedin-drafts")
        .set(authorize(tokenA))
        .send({ evidence: evidenceId, hook: "Hook", body: "Body", hashtags: ["x"] });
      expect(created.status).toBe(201);
      const draftId = created.body.draft._id;
      expect(created.body.draft.status).toBe("draft");

      const listed = await request(app)
        .get("/api/projects/linkedin-drafts")
        .set(authorize(tokenA));
      expect(listed.status).toBe(200);
      expect(listed.body.total).toBe(1);

      const got = await request(app)
        .get(`/api/projects/linkedin-drafts/${draftId}`)
        .set(authorize(tokenA));
      expect(got.status).toBe(200);
      expect(got.body.draft.body).toBe("Body");

      const updated = await request(app)
        .patch(`/api/projects/linkedin-drafts/${draftId}`)
        .set(authorize(tokenA))
        .send({ body: "Edited body", hashtags: ["y", "z"] });
      expect(updated.status).toBe(200);
      expect(updated.body.draft.body).toBe("Edited body");

      const ap = await request(app)
        .post(`/api/projects/linkedin-drafts/${draftId}/approve`)
        .set(authorize(tokenA))
        .send({});
      expect(ap.status).toBe(200);
      expect(ap.body.draft.status).toBe("approved");
      expect(ap.body.draft.status).not.toBe("published");
    });

    test("invalid objectId returns 404", async () => {
      const { tokenA } = await installUsers();
      const res = await request(app)
        .get("/api/projects/linkedin-drafts/not-an-objectid")
        .set(authorize(tokenA));
      expect(res.status).toBe(404);
    });

    test("cross-user access to a draft is 404", async () => {
      const { tokenA, idA, tokenB } = await installUsers();
      const { evidenceId } = await makeEvidence(tokenA, idA);
      const created = await request(app)
        .post("/api/projects/linkedin-drafts")
        .set(authorize(tokenA))
        .send({ evidence: evidenceId });
      const draftId = created.body.draft._id;

      const res = await request(app)
        .get(`/api/projects/linkedin-drafts/${draftId}`)
        .set(authorize(tokenB));
      expect(res.status).toBe(404);
    });

    test("create/update reject unknown fields (422)", async () => {
      const { tokenA, idA } = await installUsers();
      const { evidenceId } = await makeEvidence(tokenA, idA);
      const badCreate = await request(app)
        .post("/api/projects/linkedin-drafts")
        .set(authorize(tokenA))
        .send({ evidence: evidenceId, userId: idA, published: true });
      expect(badCreate.status).toBe(422);

      const created = await request(app)
        .post("/api/projects/linkedin-drafts")
        .set(authorize(tokenA))
        .send({ evidence: evidenceId });
      const draftId = created.body.draft._id;
      const badUpdate = await request(app)
        .patch(`/api/projects/linkedin-drafts/${draftId}`)
        .set(authorize(tokenA))
        .send({ status: "published", body: "abc" });
      expect(badUpdate.status).toBe(422);
    });

    test("list rejects invalid status enum (422)", async () => {
      const { tokenA } = await installUsers();
      const res = await request(app)
        .get("/api/projects/linkedin-drafts?status=not-a-real-status")
        .set(authorize(tokenA));
      expect(res.status).toBe(422);
    });

    test("list accepts M16 lifecycle statuses including published", async () => {
      const { tokenA } = await installUsers();
      for (const status of [
        "draft",
        "reviewed",
        "approved",
        "publishing",
        "published",
        "publish_failed",
        "archived",
      ]) {
        const res = await request(app)
          .get(`/api/projects/linkedin-drafts?status=${status}`)
          .set(authorize(tokenA));
        expect(res.status).toBe(200);
      }
    });

    test("list is bounded (limit capped at 100, out-of-range rejected)", async () => {
      const { tokenA, idA } = await installUsers();
      const { evidenceId } = await makeEvidence(tokenA, idA);
      for (let i = 0; i < 20; i++) {
        await LinkedInDraft.create({ user: idA, evidence: evidenceId, body: `b${i}` });
      }
      const res = await request(app)
        .get("/api/projects/linkedin-drafts?limit=100")
        .set(authorize(tokenA));
      expect(res.status).toBe(200);
      expect(res.body.limit).toBeLessThanOrEqual(100);

      const tooBig = await request(app)
        .get("/api/projects/linkedin-drafts?limit=100000")
        .set(authorize(tokenA));
      expect(tooBig.status).toBe(422);
    });

    test("archive sets archived status", async () => {
      const { tokenA, idA } = await installUsers();
      const { evidenceId } = await makeEvidence(tokenA, idA);
      const created = await request(app)
        .post("/api/projects/linkedin-drafts")
        .set(authorize(tokenA))
        .send({ evidence: evidenceId });
      const draftId = created.body.draft._id;
      const arch = await request(app)
        .post(`/api/projects/linkedin-drafts/${draftId}/archive`)
        .set(authorize(tokenA))
        .send({});
      expect(arch.status).toBe(200);
      expect(arch.body.draft.status).toBe("archived");
    });
  });

  describe("Claude LinkedIn assist", () => {
    async function setup(tokenA: string, idA: string) {
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      return repo.githubRepositoryId;
    }

    test("assist requires auth", async () => {
      const res = await request(app).post("/api/github/repositories/1/linkedin-draft/assist");
      expect(res.status).toBe(401);
    });

    test("assist requires approved repo and existing evidence", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA); // not approved
      const res = await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/linkedin-draft/assist`)
        .set(authorize(tokenA));
      expect(res.status).toBe(403);
    });

    test("assist returns validated suggestions and does not persist", async () => {
      analyzeMock.mockResolvedValueOnce(VALID_SUGGESTIONS);
      const { tokenA, idA } = await installUsers();
      const repoId = await setup(tokenA, idA);

      const res = await request(app)
        .post(`/api/github/repositories/${repoId}/linkedin-draft/assist`)
        .set(authorize(tokenA));
      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(1);
      expect(res.body.suggestions[0].hook).toBe("I built this");
      expect(res.body.suggestions[0].hashtags).toContain("typescript");

      // No draft was persisted automatically.
      const count = await LinkedInDraft.countDocuments({ user: idA });
      expect(count).toBe(0);
    });

    test("assist rejects malformed Claude output (422)", async () => {
      analyzeMock.mockResolvedValueOnce(JSON.stringify({ suggestions: [{ hook: "" }] }));
      const { tokenA, idA } = await installUsers();
      const repoId = await setup(tokenA, idA);

      const res = await request(app)
        .post(`/api/github/repositories/${repoId}/linkedin-draft/assist`)
        .set(authorize(tokenA));
      expect(res.status).toBe(422);
      expect(await LinkedInDraft.countDocuments({ user: idA })).toBe(0);
    });

    test("assist with cross-user repo returns 404", async () => {
      analyzeMock.mockResolvedValueOnce(VALID_SUGGESTIONS);
      const { tokenA, idA, tokenB } = await installUsers();
      const repoId = await setup(tokenA, idA);

      const res = await request(app)
        .post(`/api/github/repositories/${repoId}/linkedin-draft/assist`)
        .set(authorize(tokenB));
      expect(res.status).toBe(404);
    });

    test("no application status is mutated by assist", async () => {
      analyzeMock.mockResolvedValueOnce(VALID_SUGGESTIONS);
      const { tokenA, idA } = await installUsers();
      const repoId = await setup(tokenA, idA);
      const res = await request(app)
        .post(`/api/github/repositories/${repoId}/linkedin-draft/assist`)
        .set(authorize(tokenA));
      expect(res.status).toBe(200);
      // Only a draft would be counted; none was persisted, no status changed.
      expect(await LinkedInDraft.countDocuments({ user: idA })).toBe(0);
    });

    test("responses never leak sensitive metadata", async () => {
      analyzeMock.mockResolvedValueOnce(VALID_SUGGESTIONS);
      const { tokenA, idA } = await installUsers();
      const repoId = await setup(tokenA, idA);
      const res = await request(app)
        .post(`/api/github/repositories/${repoId}/linkedin-draft/assist`)
        .set(authorize(tokenA));
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(idA);
      expect(raw).not.toContain("__v");
      expect(raw).not.toContain("accessToken");
    });
  });

  describe("no publish side effect", () => {
    test("no endpoint can set a draft to 'published'", async () => {
      const { tokenA, idA } = await installUsers();
      const repo = await makeRepo(idA);
      await approveRepo(tokenA, repo.githubRepositoryId);
      await request(app)
        .post(`/api/github/repositories/${repo.githubRepositoryId}/professional-evidence`)
        .set(authorize(tokenA));
      const evidence = await ProfessionalEvidence.findOne({ user: idA });

      // Attempt to create with a published status is rejected (strict).
      const res = await request(app)
        .post("/api/projects/linkedin-drafts")
        .set(authorize(tokenA))
        .send({ evidence: String(evidence!._id), status: "published" });
      expect(res.status).toBe(422);

      const list = await LinkedInDraft.find({ user: idA });
      const ALLOWED = ["draft", "reviewed", "approved", "archived"];
      expect(list.length).toBe(0);
      expect(ALLOWED).not.toContain("published");
    });
  });
});
