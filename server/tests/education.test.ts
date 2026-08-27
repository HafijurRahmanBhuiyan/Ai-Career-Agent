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

describe("Education Endpoints", () => {
  const validEducation = {
    degree: "Bachelor of Science",
    institution: "MIT",
    field: "Computer Science",
    startDate: "2018-09-01",
    endDate: "2022-06-15",
    grade: "3.8 GPA",
  };

  describe("POST /api/education", () => {
    it("should create education", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .send(validEducation)
        .expect(201);

      expect(res.body.education.degree).toBe("Bachelor of Science");
      expect(res.body.education.institution).toBe("MIT");
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/education")
        .send(validEducation)
        .expect(401);
    });

    it("should reject missing required fields", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .send({ field: "CS" })
        .expect(422);
    });
  });

  describe("GET /api/education", () => {
    it("should list user's education records", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .send(validEducation);

      const res = await request(app)
        .get("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.educations).toHaveLength(1);
    });

    it("should not show another user's education", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validEducation);

      const res = await request(app)
        .get("/api/education")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(200);

      expect(res.body.educations).toHaveLength(0);
    });
  });

  describe("GET /api/education/:id", () => {
    it("should get a specific education record", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .send(validEducation);

      const id = createRes.body.education._id;

      const res = await request(app)
        .get(`/api/education/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.education.degree).toBe("Bachelor of Science");
    });

    it("should return 404 for another user's education", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      const createRes = await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${user1.token}`)
        .send(validEducation);

      const id = createRes.body.education._id;

      await request(app)
        .get(`/api/education/${id}`)
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);
    });
  });

  describe("PATCH /api/education/:id", () => {
    it("should update education", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .send(validEducation);

      const id = createRes.body.education._id;

      const res = await request(app)
        .patch(`/api/education/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ degree: "Master of Science" })
        .expect(200);

      expect(res.body.education.degree).toBe("Master of Science");
    });
  });

  describe("DELETE /api/education/:id", () => {
    it("should delete education", async () => {
      const { token } = await registerUser();

      const createRes = await request(app)
        .post("/api/education")
        .set("Authorization", `Bearer ${token}`)
        .send(validEducation);

      const id = createRes.body.education._id;

      await request(app)
        .delete(`/api/education/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(`/api/education/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
