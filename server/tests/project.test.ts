import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("Project Endpoints", () => {
  const validProject = {
    name: "AI Career Agent",
    description: "An AI-powered career automation platform",
    technologies: ["TypeScript", "React", "Node.js"],
    features: ["Job matching", "LinkedIn post generation"],
    role: "Full Stack Developer",
    githubUrl: "https://github.com/user/ai-career-agent",
    liveUrl: "https://ai-career-agent.com",
  };

  describe("POST /api/projects", () => {
    it("should create a project", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send(validProject)
        .expect(201);

      expect(res.body.project.name).toBe("AI Career Agent");
      expect(res.body.project.technologies).toContain("TypeScript");
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/projects")
        .send(validProject)
        .expect(401);
    });

    it("should reject missing required fields", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ technologies: ["React"] })
        .expect(422);
    });

    it("should reject invalid GitHub URL", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validProject, githubUrl: "not-a-url" })
        .expect(422);
    });

    it("should reject invalid live URL", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validProject, liveUrl: "ftp://invalid" })
        .expect(422);
    });
  });

  describe("GET /api/projects", () => {
    it("should list user's projects", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send(validProject);

      const res = await request(app)
        .get("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.projects).toHaveLength(1);
    });

    it("should not show another user's projects", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validProject);

      const res = await request(app)
        .get("/api/projects")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(200);

      expect(res.body.projects).toHaveLength(0);
    });
  });

  describe("GET /api/projects/:id", () => {
    it("should get a specific project", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send(validProject);

      const id = createRes.body.project._id;

      const res = await request(app)
        .get(`/api/projects/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.project.name).toBe("AI Career Agent");
    });

    it("should return 404 for another user's project", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      const createRes = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validProject);

      const id = createRes.body.project._id;

      await request(app)
        .get(`/api/projects/${id}`)
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);
    });
  });

  describe("PATCH /api/projects/:id", () => {
    it("should update a project", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send(validProject);

      const id = createRes.body.project._id;

      const res = await request(app)
        .patch(`/api/projects/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "AI Career Agent v2" })
        .expect(200);

      expect(res.body.project.name).toBe("AI Career Agent v2");
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("should delete a project", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send(validProject);

      const id = createRes.body.project._id;

      await request(app)
        .delete(`/api/projects/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(`/api/projects/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
