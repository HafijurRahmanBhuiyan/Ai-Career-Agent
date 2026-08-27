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

describe("Skill Endpoints", () => {
  const validSkill = {
    name: "TypeScript",
    category: "Programming",
    proficiency: "Advanced",
  };

  describe("POST /api/skills", () => {
    it("should create a skill", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send(validSkill)
        .expect(201);

      expect(res.body.skill.name).toBe("typescript");
      expect(res.body.skill.category).toBe("Programming");
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/skills")
        .send(validSkill)
        .expect(401);
    });

    it("should prevent duplicate skills for same user", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send(validSkill)
        .expect(201);

      const res = await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send(validSkill)
        .expect(409);

      expect(res.body.error).toContain("already exists");
    });

    it("should normalize skill name to lowercase", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "  React  ", category: "Framework" })
        .expect(201);

      expect(res.body.skill.name).toBe("react");
    });

    it("should allow same skill name for different users", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validSkill)
        .expect(201);

      await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${user2.token}`)
        .send(validSkill)
        .expect(201);
    });
  });

  describe("GET /api/skills", () => {
    it("should list user's skills", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send(validSkill);

      const res = await request(app)
        .get("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.skills).toHaveLength(1);
    });

    it("should not show another user's skills", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validSkill);

      const res = await request(app)
        .get("/api/skills")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(200);

      expect(res.body.skills).toHaveLength(0);
    });
  });

  describe("PATCH /api/skills/:id", () => {
    it("should update a skill", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send(validSkill);

      const id = createRes.body.skill._id;

      const res = await request(app)
        .patch(`/api/skills/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ proficiency: "Expert" })
        .expect(200);

      expect(res.body.skill.proficiency).toBe("Expert");
    });
  });

  describe("DELETE /api/skills/:id", () => {
    it("should delete a skill", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .send(validSkill);

      const id = createRes.body.skill._id;

      await request(app)
        .delete(`/api/skills/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const listRes = await request(app)
        .get("/api/skills")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(listRes.body.skills).toHaveLength(0);
    });
  });
});
