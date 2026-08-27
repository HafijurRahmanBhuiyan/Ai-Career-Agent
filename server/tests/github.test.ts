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
import { encryptToken } from "../src/utils/encryption";

jest.mock("../src/integrations/github/githubClient", () => {
  return {
    GitHubClient: {
      getOAuthAuthorizeUrl: jest.fn(
        () => "https://github.com/login/oauth/authorize?client_id=test"
      ),
      exchangeCodeForToken: jest.fn(() =>
        Promise.resolve({
          access_token: "gho_test_token",
          token_type: "bearer",
          scope: "read:user repo",
        })
      ),
    },
  };
});

jest.mock("../src/integrations/github/github.service", () => {
  return {
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
          {
            id: 200,
            name: "repo2",
            full_name: "testuser/repo2",
            description: "Private repo",
            html_url: "https://github.com/testuser/repo2",
            homepage: null,
            private: true,
            fork: true,
            default_branch: "main",
            language: "JavaScript",
            topics: [],
            stargazers_count: 10,
            forks_count: 3,
            size: 2048,
            created_at: "2024-02-01T00:00:00Z",
            updated_at: "2024-02-02T00:00:00Z",
            pushed_at: "2024-02-03T00:00:00Z",
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
  };
});

beforeAll(async () => {
  process.env.GITHUB_CLIENT_ID = "test_client_id";
  process.env.GITHUB_CLIENT_SECRET = "test_client_secret";
  process.env.GITHUB_CALLBACK_URL = "http://localhost:5001/api/github/callback";
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("GitHub OAuth Flow", () => {
  it("should return an authorization URL", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/github/connect")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.authorizeUrl).toContain("github.com/login/oauth/authorize");
    expect(res.body.state).toBeDefined();
  });

  it("should fail connect without authentication", async () => {
    await request(app)
      .get("/api/github/connect")
      .expect(401);
  });
});

describe("GitHub Callback", () => {
  it("should fail with missing code", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/github/callback?state=fake_state")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(res.body.error).toBe("Missing authorization code or state");
  });

  it("should fail with invalid state", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/github/callback?code=some_code&state=invalid_state")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(res.body.error).toBe("Invalid OAuth state");
  });
});

describe("GitHub Connection Status", () => {
  it("should return disconnected status", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/github/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.connected).toBe(false);
  });

  it("should return connected status when connected", async () => {
    const { token, user } = await registerUser();

    await GitHubConnection.create({
      user: (user as { id: string }).id,
      githubUserId: 12345,
      username: "testuser",
      profileUrl: "https://github.com/testuser",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      accessToken: encryptToken("gho_test_token"),
      scope: "read:user repo",
    });

    const res = await request(app)
      .get("/api/github/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.connected).toBe(true);
    expect(res.body.github.username).toBe("testuser");
  });
});

describe("GitHub Disconnect", () => {
  it("should disconnect GitHub account", async () => {
    const { token, user } = await registerUser();

    await GitHubConnection.create({
      user: (user as { id: string }).id,
      githubUserId: 12345,
      username: "testuser",
      profileUrl: "https://github.com/testuser",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      accessToken: encryptToken("gho_test_token"),
    });

    const res = await request(app)
      .post("/api/github/disconnect")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.message).toBe("GitHub account disconnected");

    const connection = await GitHubConnection.findOne({
      user: (user as { id: string }).id,
    });
    expect(connection).toBeNull();
  });

  it("should fail if not connected", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .post("/api/github/disconnect")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(res.body.error).toBe("GitHub account not connected");
  });
});

describe("GitHub Repositories", () => {
  const createConnection = async (userId: string) => {
    return GitHubConnection.create({
      user: userId,
      githubUserId: 12345,
      username: "testuser",
      profileUrl: "https://github.com/testuser",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      accessToken: encryptToken("gho_test_token"),
    });
  };

  it("should list repositories from GitHub", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    const res = await request(app)
      .get("/api/github/repositories")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.repositories).toHaveLength(2);
    expect(res.body.repositories[0].name).toBe("repo1");
    expect(res.body.repositories[0].language).toBe("TypeScript");
    expect(res.body.repositories[1].private).toBe(true);
  });

  it("should fail without connection", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/github/repositories")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(res.body.error).toContain("not connected");
  });

  it("should import a repository", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    const res = await request(app)
      .post("/api/github/repositories/100/import")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(res.body.repository.name).toBe("repo1");
    expect(res.body.repository.fullName).toBe("testuser/repo1");
    expect(res.body.repository.githubRepositoryId).toBe(100);
  });

  it("should not import the same repository twice", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    await request(app)
      .post("/api/github/repositories/100/import")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const res = await request(app)
      .post("/api/github/repositories/100/import")
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    expect(res.body.error).toBe("Repository already imported");
  });

  it("should fail to import invalid repository ID", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    const res = await request(app)
      .post("/api/github/repositories/abc/import")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(res.body.error).toBe("Invalid repository ID");
  });
});

describe("Imported Repository Operations", () => {
  const createConnection = async (userId: string) => {
    return GitHubConnection.create({
      user: userId,
      githubUserId: 12345,
      username: "testuser",
      profileUrl: "https://github.com/testuser",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      accessToken: encryptToken("gho_test_token"),
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

  it("should list imported repositories", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);
    await importRepo((user as { id: string }).id);

    const res = await request(app)
      .get("/api/github/repositories/imported")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.repositories[0].fullName).toBe("testuser/repo1");
  });

  it("should sync an imported repository", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);
    await importRepo((user as { id: string }).id);

    const res = await request(app)
      .post("/api/github/repositories/100/sync")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.repository.description).toBe("Updated description");
    expect(res.body.repository.stars).toBe(15);
  });

  it("should fail to sync non-imported repository", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    const res = await request(app)
      .post("/api/github/repositories/999/sync")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(res.body.error).toBe("Repository not imported");
  });

  it("should delete an imported repository", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);
    await importRepo((user as { id: string }).id);

    const res = await request(app)
      .delete("/api/github/repositories/100")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.message).toBe("Repository import removed");

    const count = await GitHubRepositoryModel.countDocuments({
      user: (user as { id: string }).id,
    });
    expect(count).toBe(0);
  });

  it("should fail to delete non-imported repository", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    const res = await request(app)
      .delete("/api/github/repositories/999")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(res.body.error).toBe("Imported repository not found");
  });

  it("should get repository languages", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);
    await importRepo((user as { id: string }).id);

    const res = await request(app)
      .get("/api/github/repositories/100/languages")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.languages.TypeScript).toBe(50000);
    expect(res.body.languages.JavaScript).toBe(30000);
  });

  it("should get repository readme", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);
    await importRepo((user as { id: string }).id);

    const res = await request(app)
      .get("/api/github/repositories/100/readme")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.name).toBe("README.md");
    expect(res.body.content).toContain("Test Repo");
  });

  it("should fail to get languages for non-imported repo", async () => {
    const { token, user } = await registerUser();
    await createConnection((user as { id: string }).id);

    const res = await request(app)
      .get("/api/github/repositories/999/languages")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(res.body.error).toBe("Repository not imported");
  });
});

describe("GitHub Security", () => {
  it("should isolate repos between users", async () => {
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
      name: "private-repo",
      fullName: "user1/private-repo",
      description: "User 1 repo",
      htmlUrl: "https://github.com/user1/private-repo",
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
      .get("/api/github/repositories/imported")
      .set("Authorization", `Bearer ${user2.token}`)
      .expect(200);

    expect(res.body.repositories).toHaveLength(0);
  });

  it("should prevent IDOR on sync", async () => {
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
      name: "private-repo",
      fullName: "user1/private-repo",
      description: "User 1 repo",
      htmlUrl: "https://github.com/user1/private-repo",
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
      .post("/api/github/repositories/1/sync")
      .set("Authorization", `Bearer ${user2.token}`)
      .expect(404);

    expect(res.body.error).toBe("Repository not imported");
  });

  it("should require authentication for all endpoints", async () => {
    const endpoints = [
      ["GET", "/api/github/connect"],
      ["GET", "/api/github/status"],
      ["POST", "/api/github/disconnect"],
      ["GET", "/api/github/repositories"],
      ["GET", "/api/github/repositories/imported"],
    ];

    for (const [method, path] of endpoints) {
      const req = request(app);
      const res = await (method === "GET" ? req.get(path) : req.post(path));
      expect(res.status).toBe(401);
    }
  });
});
