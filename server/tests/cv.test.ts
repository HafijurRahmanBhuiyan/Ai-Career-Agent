import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import CVProfile from "../src/models/CVProfile";
import { Types } from "mongoose";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("CV PDF generation", () => {
  it("should generate a PDF for a complete CV profile", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    const profile = await CVProfile.create({
      user: userId,
      title: "Software Engineer CV",
      personalInfo: {
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: "010001",
        location: "Bangladesh",
      },
      professionalSummary: "Experienced engineer.",
      education: [
        {
          institution: "BUET",
          degree: "BSc",
          degreeType: "BSc",
          field: "CSE",
          startDate: "2015",
          endDate: "2019",
        },
      ],
      workExperience: [
        {
          company: "Acme",
          designation: "Engineer",
          startDate: "2019",
          current: true,
        },
      ],
      skills: ["TypeScript", "React"],
    });

    const res = await request(app)
      .get(`/api/cv/${profile._id}/generate-pdf`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body.length).toBeGreaterThan(100);
  });

  it("should not return an internal server error when a stored CV lacks personalInfo (legacy/partial record)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    // Insert directly so mongoose validation is bypassed, simulating a
    // legacy/partial CV record that has no personalInfo.
    const inserted = await CVProfile.collection.insertOne({
      user: new Types.ObjectId(userId),
      title: "Legacy CV",
      professionalSummary: "",
      education: [],
      workExperience: [],
      skills: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Record<string, unknown>);

    const id = inserted.insertedId;

    const res = await request(app)
      .get(`/api/cv/${id}/generate-pdf`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body.length).toBeGreaterThan(100);
  });

  it("should reject PDF generation for another user's CV", async () => {
    const { user } = await registerUser();

    const otherUser = await CVProfile.create({
      user: (user as { id: string }).id,
      title: "Someone Else's CV",
      personalInfo: {
        fullName: "Other Person",
        email: "other@example.com",
        phone: "0",
        location: "Dhaka",
      },
      professionalSummary: "",
      education: [],
      workExperience: [],
      skills: [],
    });

    const { token: otherToken } = await registerSecondUser();

    const res = await request(app)
      .get(`/api/cv/${otherUser._id}/generate-pdf`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    expect(res.body.error).toBe("CV profile not found");
  });
});