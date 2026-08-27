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

describe("Experience Endpoints", () => {
  const validExperience = {
    company: "Google",
    position: "Software Engineer",
    description: "Built cool stuff",
    startDate: "2022-01-15",
    endDate: "2024-01-15",
    currentlyWorking: false,
  };

  describe("POST /api/experience", () => {
    it("should create experience", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send(validExperience)
        .expect(201);

      expect(res.body.experience.company).toBe("Google");
      expect(res.body.experience.position).toBe("Software Engineer");
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/experience")
        .send(validExperience)
        .expect(401);
    });

    it("should reject missing required fields", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "Just a description" })
        .expect(422);
    });

    it("should create experience with currentlyWorking=true and no endDate", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send({
          company: "Meta",
          position: "Senior Engineer",
          startDate: "2023-01-01",
          currentlyWorking: true,
        })
        .expect(201);

      expect(res.body.experience.currentlyWorking).toBe(true);
      expect(res.body.experience.endDate).toBeUndefined();
    });

    it("should reject endDate when currentlyWorking is true", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send({
          company: "Meta",
          position: "Senior Engineer",
          startDate: "2023-01-01",
          endDate: "2024-01-01",
          currentlyWorking: true,
        })
        .expect(422);
    });
  });

  describe("GET /api/experience", () => {
    it("should list user's experience records", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send(validExperience);

      const res = await request(app)
        .get("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.experiences).toHaveLength(1);
    });

    it("should not show another user's experience", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validExperience);

      const res = await request(app)
        .get("/api/experience")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(200);

      expect(res.body.experiences).toHaveLength(0);
    });
  });

  describe("GET /api/experience/:id", () => {
    it("should get a specific experience", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send(validExperience);

      const id = createRes.body.experience._id;

      const res = await request(app)
        .get(`/api/experience/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.experience.company).toBe("Google");
    });

    it("should return 404 for another user's experience", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      const createRes = await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validExperience);

      const id = createRes.body.experience._id;

      await request(app)
        .get(`/api/experience/${id}`)
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);
    });
  });

  describe("PATCH /api/experience/:id", () => {
    it("should update experience", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send(validExperience);

      const id = createRes.body.experience._id;

      const res = await request(app)
        .patch(`/api/experience/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ position: "Senior Software Engineer" })
        .expect(200);

      expect(res.body.experience.position).toBe("Senior Software Engineer");
    });
  });

  describe("DELETE /api/experience/:id", () => {
    it("should delete experience", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/experience")
        .set("Authorization", `Bearer ${token}`)
        .send(validExperience);

      const id = createRes.body.experience._id;

      await request(app)
        .delete(`/api/experience/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(`/api/experience/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
