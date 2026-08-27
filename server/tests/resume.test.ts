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

describe("Resume Endpoints", () => {
  const validResume = {
    title: "Senior Developer Resume",
    fileName: "resume_v1.pdf",
    version: 1,
    isActive: false,
  };

  describe("POST /api/resumes", () => {
    it("should create a resume", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send(validResume)
        .expect(201);

      expect(res.body.resume.title).toBe("Senior Developer Resume");
      expect(res.body.resume.isActive).toBe(false);
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/resumes")
        .send(validResume)
        .expect(401);
    });

    it("should reject missing required fields", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send({ version: 1 })
        .expect(422);
    });

    it("should deactivate other resumes when creating an active one", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validResume, isActive: true });

      await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "V2 Resume", fileName: "resume_v2.pdf", isActive: true });

      const res = await request(app)
        .get("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const activeResumes = res.body.resumes.filter((r: Record<string, unknown>) => r.isActive === true);
      expect(activeResumes).toHaveLength(1);
    });
  });

  describe("GET /api/resumes", () => {
    it("should list user's resumes", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send(validResume);

      const res = await request(app)
        .get("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.resumes).toHaveLength(1);
    });

    it("should not show another user's resumes", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validResume);

      const res = await request(app)
        .get("/api/resumes")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(200);

      expect(res.body.resumes).toHaveLength(0);
    });
  });

  describe("GET /api/resumes/:id", () => {
    it("should get a specific resume", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send(validResume);

      const id = createRes.body.resume._id;

      const res = await request(app)
        .get(`/api/resumes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.resume.title).toBe("Senior Developer Resume");
    });

    it("should return 404 for another user's resume", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      const createRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validResume);

      const id = createRes.body.resume._id;

      await request(app)
        .get(`/api/resumes/${id}`)
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);
    });
  });

  describe("PATCH /api/resumes/:id", () => {
    it("should update a resume", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send(validResume);

      const id = createRes.body.resume._id;

      const res = await request(app)
        .patch(`/api/resumes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Updated Resume Title" })
        .expect(200);

      expect(res.body.resume.title).toBe("Updated Resume Title");
    });

    it("should deactivate other resumes when activating one", async () => {
      const { token } = await registerUser();

      const res1 = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validResume, isActive: true });

      const res2 = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "V2", fileName: "v2.pdf", isActive: false });

      const id2 = res2.body.resume._id;

      await request(app)
        .patch(`/api/resumes/${id2}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isActive: true })
        .expect(200);

      const listRes = await request(app)
        .get("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const activeResumes = listRes.body.resumes.filter((r: Record<string, unknown>) => r.isActive === true);
      expect(activeResumes).toHaveLength(1);
    });
  });

  describe("DELETE /api/resumes/:id", () => {
    it("should delete a resume", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .send(validResume);

      const id = createRes.body.resume._id;

      await request(app)
        .delete(`/api/resumes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(`/api/resumes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
