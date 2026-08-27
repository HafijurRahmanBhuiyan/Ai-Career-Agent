import request from "supertest";
import { app } from "../src/app";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import GitHubConnection from "../src/models/GitHubConnection";
import GitHubRepositoryModel from "../src/models/GitHubRepository";
import ProjectAnalysis from "../src/models/ProjectAnalysis";
import { encryptToken } from "../src/utils/encryption";

const mockClaudeResponse = JSON.stringify({
  projectSummary: "A full-stack web application for task management with real-time collaboration features.",
  problemStatement: "Teams need a centralized platform to manage projects and collaborate in real-time.",
  keyFeatures: ["Real-time task updates", "Team collaboration", "Project dashboards"],
  technologies: ["React", "Node.js", "MongoDB", "Socket.io"],
  programmingLanguages: ["TypeScript", "JavaScript"],
  frameworks: ["React", "Express.js"],
  databases: ["MongoDB"],
  tools: ["Git", "Docker", "Jest"],
  cloudServices: ["AWS"],
  architecture: "Client-server architecture with REST API and WebSocket connections",
  developmentHighlights: ["TypeScript throughout", "Test-driven development"],
  skillsDemonstrated: ["Full-stack development", "Real-time systems", "API design"],
  difficultyLevel: "Intermediate",
  developerRole: "Full-Stack Developer",
  resumeDescription: "Built a real-time task management platform with collaborative features serving teams.",
  linkedinDescription: "Developed a full-stack task management application featuring real-time collaboration.",
  suggestedTags: ["task-management", "real-time", "collaboration"],
});

jest.mock("../src/integrations/github/githubClient", () => ({
  GitHubClient: {
    getOAuthAuthorizeUrl: jest.fn(() => "https://github.com/login/oauth/authorize?client_id=test"),
    exchangeCodeForToken: jest.fn(() =>
      Promise.resolve({ access_token: "gho_test_token", token_type: "bearer", scope: "read:user repo" })
    ),
  },
}));

jest.mock("../src/integrations/github/github.service", () => ({
  GitHubService: jest.fn().mockImplementation(() => ({
    getAuthenticatedUser: jest.fn(() =>
      Promise.resolve({
        id: 12345,
        login: "testuser",
        avatar_url: "https://avatars.githubusercontent.com/u/12345",
        html_url: "https://github.com/testuser",
        name: "Test User",
        email: "test@github.com",
      })
    ),
    getUserRepositories: jest.fn(() =>
      Promise.resolve([
        {
          id: 100,
          name: "repo1",
          full_name: "testuser/repo1",
          description: "A test repo",
          html_url: "https://github.com/testuser/repo1",
          homepage: null,
          private: false,
          fork: false,
          default_branch: "main",
          language: "TypeScript",
          topics: ["test"],
          stargazers_count: 5,
          forks_count: 2,
          size: 1024,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          pushed_at: "2024-01-03T00:00:00Z",
        },
      ])
    ),
    getRepository: jest.fn(() =>
      Promise.resolve({
        id: 100,
        name: "repo1",
        full_name: "testuser/repo1",
        description: "Updated description",
        html_url: "https://github.com/testuser/repo1",
        homepage: null,
        private: false,
        fork: false,
        default_branch: "main",
        language: "TypeScript",
        topics: ["test", "updated"],
        stargazers_count: 15,
        forks_count: 5,
        size: 1024,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-06-01T00:00:00Z",
        pushed_at: "2024-06-02T00:00:00Z",
      })
    ),
    getRepositoryLanguages: jest.fn(() =>
      Promise.resolve({ TypeScript: 50000, JavaScript: 30000, HTML: 5000 })
    ),
    getRepositoryReadme: jest.fn(() =>
      Promise.resolve({
        name: "README.md",
        path: "README.md",
        content: Buffer.from("# Test Repo\n\nThis is a test.").toString("base64"),
        encoding: "base64",
      })
    ),
  })),
}));

jest.mock("../src/integrations/claude/claudeClient", () => {
  let callCount = 0;
  return {
    getModel: jest.fn(() => "claude-sonnet-4-20250514"),
    getMaxTokens: jest.fn(() => 4096),
    getReadmeLimit: jest.fn(() => 15000),
    truncateReadme: jest.fn((readme: string) => {
      if (!readme || readme.length <= 15000) {
        return { content: readme || "", truncated: false };
      }
      return { content: readme.slice(0, 15000) + "\n\n[README truncated at 15000 characters]", truncated: true };
    }),
    resetClient: jest.fn(),
    analyzeProject: jest.fn(() => {
      callCount++;
      return Promise.resolve(mockClaudeResponse);
    }),
  };
});

beforeAll(async () => {
  process.env.GITHUB_CLIENT_ID = "test_client_id";
  process.env.GITHUB_CLIENT_SECRET = "test_client_secret";
  process.env.GITHUB_CALLBACK_URL = "http://localhost:5001/api/github/callback";
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  process.env.CLAUDE_MODEL = "claude-sonnet-4-20250514";
  process.env.CLAUDE_MAX_TOKENS = "4096";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

const createConnection = async (userId: string) => {
  return GitHubConnection.create({
    user: userId,
    githubUserId: 12345,
    username: "testuser",
    profileUrl: "https://github.com/testuser",
    avatarUrl: "https://avatars.githubusercontent.com/u/12345",
    accessToken: encryptToken("gho_test_token"),
    scope: "read:user repo",
  });
};

const importRepo = async (userId: string, repoId = 100) => {
  return GitHubRepositoryModel.create({
    user: userId,
    githubRepositoryId: repoId,
    name: "repo1",
    fullName: "testuser/repo1",
    description: "A test repo",
    htmlUrl: "https://github.com/testuser/repo1",
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
  });
};

describe("Project Analysis API", () => {
  describe("POST /api/github/repositories/:id/analyze", () => {
    it("should require authentication", async () => {
      await request(app)
        .post("/api/github/repositories/100/analyze")
        .expect(401);
    });

    it("should fail without GitHub connection", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/github/repositories/100/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect(res.body.error).toContain("not connected");
    });

    it("should fail with non-imported repository", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);

      const res = await request(app)
        .post("/api/github/repositories/999/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);

      expect(res.body.error).toBe("Repository not imported");
    });

    it("should fail with invalid repository ID", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);

      const res = await request(app)
        .post("/api/github/repositories/abc/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect(res.body.error).toBe("Invalid repository ID");
    });

    it("should analyze an imported repository", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);
      await importRepo((user as { id: string }).id);

      const res = await request(app)
        .post("/api/github/repositories/100/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.analysis).toBeDefined();
      expect(res.body.analysis.projectSummary).toBe(
        "A full-stack web application for task management with real-time collaboration features."
      );
      expect(res.body.analysis.difficultyLevel).toBe("Intermediate");
      expect(res.body.analysis.aiModel).toBe("claude-sonnet-4-20250514");
      expect(res.body.analysis.promptVersion).toBe("v1");
      expect(res.body.readmeTruncated).toBe(false);
    });

    it("should store analysis in database", async () => {
      const { token, user } = await registerUser();
      const userId = (user as { id: string }).id;
      await createConnection(userId);
      const repo = await importRepo(userId);

      await request(app)
        .post("/api/github/repositories/100/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const stored = await ProjectAnalysis.findOne({ user: userId });
      expect(stored).toBeDefined();
      expect(stored!.githubRepository.toString()).toBe(repo._id.toString());
      expect(stored!.technologies).toContain("React");
      expect(stored!.promptVersion).toBe("v1");
    });

    it("should not expose secrets in response", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);
      await importRepo((user as { id: string }).id);

      const res = await request(app)
        .post("/api/github/repositories/100/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const responseStr = JSON.stringify(res.body);
      expect(responseStr).not.toContain("gho_test_token");
      expect(responseStr).not.toContain("test-api-key");
      expect(responseStr).not.toContain("accessToken");
    });
  });

  describe("GET /api/github/repositories/:id/analysis", () => {
    it("should require authentication", async () => {
      await request(app)
        .get("/api/github/repositories/100/analysis")
        .expect(401);
    });

    it("should return 404 when no analysis exists", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);
      await importRepo((user as { id: string }).id);

      await request(app)
        .get("/api/github/repositories/100/analysis")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("should return the latest analysis", async () => {
      const { token, user } = await registerUser();
      const userId = (user as { id: string }).id;
      await createConnection(userId);
      const repo = await importRepo(userId);

      await ProjectAnalysis.create({
        user: userId,
        githubRepository: repo._id,
        projectSummary: "Test summary",
        problemStatement: "Test problem",
        keyFeatures: ["Feature 1"],
        technologies: ["React"],
        programmingLanguages: ["TypeScript"],
        frameworks: ["Express"],
        databases: [],
        tools: [],
        cloudServices: [],
        architecture: "Monolith",
        developmentHighlights: [],
        skillsDemonstrated: ["Full-stack"],
        difficultyLevel: "Intermediate",
        developerRole: "Developer",
        resumeDescription: "Built stuff",
        linkedinDescription: "Built cool stuff",
        suggestedTags: ["test"],
        aiModel: "claude-sonnet-4-20250514",
        promptVersion: "v1",
      });

      const res = await request(app)
        .get("/api/github/repositories/100/analysis")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.analysis.projectSummary).toBe("Test summary");
    });

    it("should fail with non-imported repository", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);

      const res = await request(app)
        .get("/api/github/repositories/999/analysis")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);

      expect(res.body.error).toBe("Repository not imported");
    });
  });

  describe("GET /api/github/repositories/:id/analyses", () => {
    it("should require authentication", async () => {
      await request(app)
        .get("/api/github/repositories/100/analyses")
        .expect(401);
    });

    it("should return analysis history", async () => {
      const { token, user } = await registerUser();
      const userId = (user as { id: string }).id;
      await createConnection(userId);
      const repo = await importRepo(userId);

      await ProjectAnalysis.create({
        user: userId,
        githubRepository: repo._id,
        projectSummary: "First analysis",
        problemStatement: "Problem 1",
        keyFeatures: ["F1"],
        technologies: ["React"],
        programmingLanguages: ["TypeScript"],
        frameworks: [],
        databases: [],
        tools: [],
        cloudServices: [],
        architecture: "Monolith",
        developmentHighlights: [],
        skillsDemonstrated: ["Dev"],
        difficultyLevel: "Beginner",
        developerRole: "Developer",
        resumeDescription: "Desc 1",
        linkedinDescription: "LinkedIn 1",
        suggestedTags: [],
        aiModel: "claude-sonnet-4-20250514",
        promptVersion: "v1",
        analyzedAt: new Date("2024-01-01"),
      });

      await ProjectAnalysis.create({
        user: userId,
        githubRepository: repo._id,
        projectSummary: "Second analysis",
        problemStatement: "Problem 2",
        keyFeatures: ["F2"],
        technologies: ["Vue"],
        programmingLanguages: ["JavaScript"],
        frameworks: [],
        databases: [],
        tools: [],
        cloudServices: [],
        architecture: "Microservices",
        developmentHighlights: [],
        skillsDemonstrated: ["Full-stack"],
        difficultyLevel: "Advanced",
        developerRole: "Lead Developer",
        resumeDescription: "Desc 2",
        linkedinDescription: "LinkedIn 2",
        suggestedTags: [],
        aiModel: "claude-sonnet-4-20250514",
        promptVersion: "v1",
        analyzedAt: new Date("2024-06-01"),
      });

      const res = await request(app)
        .get("/api/github/repositories/100/analyses")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.analyses).toHaveLength(2);
      expect(res.body.analyses[0].projectSummary).toBe("Second analysis");
      expect(res.body.analyses[1].projectSummary).toBe("First analysis");
    });

    it("should return empty array when no analyses exist", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);
      await importRepo((user as { id: string }).id);

      const res = await request(app)
        .get("/api/github/repositories/100/analyses")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.analyses).toHaveLength(0);
    });
  });

  describe("POST /api/github/repositories/:id/reanalyze", () => {
    it("should create a new analysis version", async () => {
      const { token, user } = await registerUser();
      const userId = (user as { id: string }).id;
      await createConnection(userId);
      const repo = await importRepo(userId);

      await ProjectAnalysis.create({
        user: userId,
        githubRepository: repo._id,
        projectSummary: "Old analysis",
        problemStatement: "Old problem",
        keyFeatures: [],
        technologies: [],
        programmingLanguages: [],
        frameworks: [],
        databases: [],
        tools: [],
        cloudServices: [],
        architecture: "",
        developmentHighlights: [],
        skillsDemonstrated: [],
        difficultyLevel: "Beginner",
        developerRole: "Developer",
        resumeDescription: "Old",
        linkedinDescription: "Old",
        suggestedTags: [],
        aiModel: "claude-sonnet-4-20250514",
        promptVersion: "v1",
      });

      const res = await request(app)
        .post("/api/github/repositories/100/reanalyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.analysis.projectSummary).not.toBe("Old analysis");

      const count = await ProjectAnalysis.countDocuments({ user: userId });
      expect(count).toBe(2);
    });

    it("should preserve historical analyses", async () => {
      const { token, user } = await registerUser();
      const userId = (user as { id: string }).id;
      await createConnection(userId);
      const repo = await importRepo(userId);

      await ProjectAnalysis.create({
        user: userId,
        githubRepository: repo._id,
        projectSummary: "Historical",
        problemStatement: "Old",
        keyFeatures: [],
        technologies: [],
        programmingLanguages: [],
        frameworks: [],
        databases: [],
        tools: [],
        cloudServices: [],
        architecture: "",
        developmentHighlights: [],
        skillsDemonstrated: [],
        difficultyLevel: "Beginner",
        developerRole: "Developer",
        resumeDescription: "Old",
        linkedinDescription: "Old",
        suggestedTags: [],
        aiModel: "claude-sonnet-4-20250514",
        promptVersion: "v1",
      });

      await request(app)
        .post("/api/github/repositories/100/reanalyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/github/repositories/100/analyses")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.analyses).toHaveLength(2);
      const summaries = res.body.analyses.map((a: { projectSummary: string }) => a.projectSummary);
      expect(summaries).toContain("Historical");
    });
  });

  describe("Security", () => {
    it("should prevent User A from accessing User B analysis", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      const encryptedToken = encryptToken("gho_test_token");

      await GitHubConnection.create({
        user: (user1.user as { id: string }).id,
        githubUserId: 100,
        username: "user1",
        profileUrl: "https://github.com/user1",
        avatarUrl: "https://avatars.githubusercontent.com/u/100",
        accessToken: encryptedToken,
      });

      await GitHubConnection.create({
        user: (user2.user as { id: string }).id,
        githubUserId: 200,
        username: "user2",
        profileUrl: "https://github.com/user2",
        avatarUrl: "https://avatars.githubusercontent.com/u/200",
        accessToken: encryptedToken,
      });

      const repo1 = await GitHubRepositoryModel.create({
        user: (user1.user as { id: string }).id,
        githubRepositoryId: 1,
        name: "user1-repo",
        fullName: "user1/user1-repo",
        description: "User 1 repo",
        htmlUrl: "https://github.com/user1/user1-repo",
        private: true,
        fork: false,
        defaultBranch: "main",
        language: "TypeScript",
        stars: 0,
        forks: 0,
        size: 100,
        createdAtGithub: new Date(),
        updatedAtGithub: new Date(),
        pushedAtGithub: new Date(),
      });

      await ProjectAnalysis.create({
        user: (user1.user as { id: string }).id,
        githubRepository: repo1._id,
        projectSummary: "Private project",
        problemStatement: "Private problem",
        keyFeatures: [],
        technologies: [],
        programmingLanguages: [],
        frameworks: [],
        databases: [],
        tools: [],
        cloudServices: [],
        architecture: "",
        developmentHighlights: [],
        skillsDemonstrated: [],
        difficultyLevel: "Beginner",
        developerRole: "Developer",
        resumeDescription: "Private",
        linkedinDescription: "Private",
        suggestedTags: [],
        aiModel: "claude-sonnet-4-20250514",
        promptVersion: "v1",
      });

      const res = await request(app)
        .get("/api/github/repositories/1/analysis")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);

      expect(res.body.error).toBe("Repository not imported");
    });

    it("should prevent User A from analyzing User B repository", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      const encryptedToken = encryptToken("gho_test_token");

      await GitHubConnection.create({
        user: (user1.user as { id: string }).id,
        githubUserId: 100,
        username: "user1",
        profileUrl: "https://github.com/user1",
        avatarUrl: "https://avatars.githubusercontent.com/u/100",
        accessToken: encryptedToken,
      });

      await GitHubConnection.create({
        user: (user2.user as { id: string }).id,
        githubUserId: 200,
        username: "user2",
        profileUrl: "https://github.com/user2",
        avatarUrl: "https://avatars.githubusercontent.com/u/200",
        accessToken: encryptedToken,
      });

      await GitHubRepositoryModel.create({
        user: (user1.user as { id: string }).id,
        githubRepositoryId: 1,
        name: "user1-repo",
        fullName: "user1/user1-repo",
        description: "User 1 repo",
        htmlUrl: "https://github.com/user1/user1-repo",
        private: true,
        fork: false,
        defaultBranch: "main",
        language: "TypeScript",
        stars: 0,
        forks: 0,
        size: 100,
        createdAtGithub: new Date(),
        updatedAtGithub: new Date(),
        pushedAtGithub: new Date(),
      });

      const res = await request(app)
        .post("/api/github/repositories/1/analyze")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);

      expect(res.body.error).toBe("Repository not imported");
    });

    it("should require authentication for all analysis endpoints", async () => {
      const endpoints = [
        ["POST", "/api/github/repositories/100/analyze"],
        ["GET", "/api/github/repositories/100/analysis"],
        ["GET", "/api/github/repositories/100/analyses"],
        ["POST", "/api/github/repositories/100/reanalyze"],
      ];

      for (const [method, path] of endpoints) {
        const req = request(app);
        const res = await (method === "GET" ? req.get(path) : req.post(path));
        expect(res.status).toBe(401);
      }
    });
  });

  describe("API Key Security", () => {
    it("should never expose ANTHROPIC_API_KEY", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);
      await importRepo((user as { id: string }).id);

      const res = await request(app)
        .post("/api/github/repositories/100/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const fullResponse = JSON.stringify(res.body);
      expect(fullResponse).not.toContain("test-api-key");
      expect(fullResponse).not.toContain("ANTHROPIC_API_KEY");
    });

    it("should never expose GitHub access token", async () => {
      const { token, user } = await registerUser();
      await createConnection((user as { id: string }).id);
      await importRepo((user as { id: string }).id);

      const res = await request(app)
        .post("/api/github/repositories/100/analyze")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const fullResponse = JSON.stringify(res.body);
      expect(fullResponse).not.toContain("gho_");
      expect(fullResponse).not.toContain("accessToken");
    });
  });
});
