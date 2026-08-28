import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import Profile from "../src/models/Profile";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
  jest.restoreAllMocks();
});

describe("Settings endpoint", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("reports source connectivity without leaking keys", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const sources = res.body.sources as Array<{
      id: string;
      name: string;
      configured: boolean;
    }>;
    const ids = sources.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["mock", "adzuna", "arbeitnow", "remoteok"]));

    const adzuna = sources.find((s) => s.id === "adzuna");
    expect(adzuna!.configured).toBe(false);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("app_id");
    expect(body).not.toContain("app_key");
    expect(body).not.toContain("ADZUNA_APP_KEY");
  });

  it("reports adzuna as configured when env keys are present (masked)", async () => {
    process.env.ADZUNA_APP_ID = "secret-id";
    process.env.ADZUNA_APP_KEY = "secret-key";
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${token}`);

    const adzuna = res.body.sources.find(
      (s: { id: string }) => s.id === "adzuna"
    );
    expect(adzuna.configured).toBe(true);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("secret-id");
    expect(body).not.toContain("secret-key");
  });

  it("reflects profile job search preferences and notification settings", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    await Profile.create({
      user: userId,
      jobSearchPreferences: {
        roles: ["Full Stack Developer"],
        locations: ["Remote"],
        remote: "remote",
        experienceLevel: "senior",
        salaryMinimum: 90000,
      },
      notificationEmail: "notify@example.com",
      gmailNotifyEnabled: true,
    });

    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.jobSearchPreferences.roles).toContain("Full Stack Developer");
    expect(res.body.jobSearchPreferences.remote).toBe("remote");
    expect(res.body.notifications.notificationEmail).toBe("notify@example.com");
    expect(res.body.notifications.gmailNotifyEnabled).toBe(true);
  });
});
