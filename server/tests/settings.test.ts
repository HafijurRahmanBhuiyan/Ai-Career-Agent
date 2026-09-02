import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import Profile from "../src/models/Profile";
import { selectJobSources } from "../src/integrations/jobs/bootstrap";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
});

describe("Settings endpoint", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("reports registered source connectivity without leaking keys", async () => {
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

    // Adzuna is only registered when its API credentials exist at startup; the
    // other live sources and the test/development Mock source are always present.
    const expected = selectJobSources(process.env);
    expect(ids.sort()).toEqual(expected.sort());

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("app_id");
    expect(body).not.toContain("app_key");
    expect(body).not.toContain("ADZUNA_APP_KEY");
    expect(body).not.toContain("ADZUNA_APP_ID");
  });

  it("does not expose Adzuna credentials or the raw env in responses", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("app_id");
    expect(body).not.toContain("app_key");
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
