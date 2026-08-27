import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("Health Endpoint", () => {
  it("should return healthy status", async () => {
    const res = await request(app)
      .get("/api/health")
      .expect(200);

    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("AI Career Agent API");
    expect(res.body).toHaveProperty("database");
  });
});

describe("404 Handler", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await request(app)
      .get("/api/nonexistent")
      .expect(404);

    expect(res.body.statusCode).toBe(404);
  });
});
