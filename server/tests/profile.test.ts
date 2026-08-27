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

describe("Profile Endpoints", () => {
  describe("POST /api/profile", () => {
    it("should create a profile for authenticated user", async () => {
      const { token } = await registerUser();

      const res = await request(app)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "John Doe", headline: "Software Engineer" })
        .expect(201);

      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.fullName).toBe("John Doe");
      expect(res.body.profile.headline).toBe("Software Engineer");
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/profile")
        .send({ fullName: "John Doe" })
        .expect(401);
    });

    it("should reject duplicate profile", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "John Doe" })
        .expect(201);

      const res = await request(app)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Jane Doe" })
        .expect(409);

      expect(res.body.error).toContain("already exists");
    });
  });

  describe("GET /api/profile", () => {
    it("should get the user's profile", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "John Doe" });

      const res = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.profile.fullName).toBe("John Doe");
    });

    it("should return 404 if no profile exists", async () => {
      const { token } = await registerUser();

      await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("should not return another user's profile", async () => {
      const user1 = await registerUser();
      const user2 = await registerSecondUser();

      await request(app)
        .post("/api/profile")
        .set("Authorization", `Bearer ${user1.token}`)
        .send({ fullName: "User One" });

      const res = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${user2.token}`)
        .expect(404);

      expect(res.body.error).toBe("Profile not found");
    });
  });

  describe("PATCH /api/profile", () => {
    it("should update the user's profile", async () => {
      const { token } = await registerUser();

      await request(app)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "John Doe" });

      const res = await request(app)
        .patch("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "John Updated", location: "New York" })
        .expect(200);

      expect(res.body.profile.fullName).toBe("John Updated");
      expect(res.body.profile.location).toBe("New York");
    });

    it("should return 404 if no profile exists", async () => {
      const { token } = await registerUser();

      await request(app)
        .patch("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "John" })
        .expect(404);
    });
  });
});
