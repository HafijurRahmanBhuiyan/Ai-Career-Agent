import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Resume from "../src/models/Resume";
import { deriveResumeEvidenceFromText, deriveResumeEvidenceWithAI } from "../src/services/resumeEvidence";
import {
  deriveJobRequirementsFromDescription,
  deriveJobRequirementsWithAI,
} from "../src/services/jobRequirementExtraction";
import { prepareMatchJob } from "../src/services/jobMatchJob";

/**
 * (Phase 2, Step 3) Tests for resume/CV content intelligence and structured job
 * requirement extraction. All AI paths are mocked; no real provider API is ever
 * called. AI-failure tests neutralize GEMINI/OPENAI/DEFAULT provider env keys in
 * try/finally so a rejected mock cannot silently hit a real provider.
 */

jest.mock("../src/integrations/claude/claudeClient", () => {
  const impl = {
    getModel: jest.fn(() => "claude-sonnet-4-20250514"),
    getMaxTokens: jest.fn(() => 4096),
    getReadmeLimit: jest.fn(() => 15000),
    truncateReadme: jest.fn((r: string) => ({ content: r || "", truncated: false })),
    resetClient: jest.fn(),
    analyzeProject: jest.fn((system: string) => {
      if (system && system.includes("job requirement")) {
        return Promise.resolve(
          JSON.stringify({
            required: ["5+ years of React"],
            preferred: ["Kubernetes"],
            technologies: ["React", "Node.js"],
            experience: { years: 5, level: "senior" },
            education: { degree: "Bachelor's", field: "Computer Science" },
            location: null,
            remote: { type: "remote" },
            employment: ["full-time"],
            salary: { min: 100000, max: 160000, currency: "$", period: "yearly" },
            other: [],
            unavailable: false,
          })
        );
      }
      if (system && system.includes("resume text")) {
        return Promise.resolve(
          JSON.stringify({
            summary: "Senior engineer.",
            skills: ["TypeScript"],
            technologies: ["React"],
            roles: ["Senior Engineer"],
            employers: ["Acme"],
            yearsExperience: 5,
            projects: [],
            achievements: [],
            education: [{ degree: "Bachelor's", institution: "State U", field: "CS" }],
            certifications: [],
            domains: ["web"],
          })
        );
      }
      return Promise.resolve(
        JSON.stringify({
          score: 80,
          summary: "Good alignment.",
          matchingSkills: ["React"],
          missingSkills: [],
          matchingTechnologies: [],
          missingTechnologies: [],
          experienceMatch: "Matches.",
          experienceGap: "",
          educationMatch: "OK",
          educationGap: "",
          locationMatch: "",
          remoteMatch: "",
          employmentTypeMatch: "",
          salaryMatch: "",
          strengths: ["React"],
          weaknesses: [],
          gaps: [],
          recommendation: "apply",
          recommendationReason: "Fit.",
        })
      );
    }),
  };
  return impl;
});

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  process.env.CLAUDE_MODEL = "claude-sonnet-4-20250514";
  process.env.CLAUDE_MAX_TOKENS = "4096";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

// ---------------------------------------------------------------------------
// A–C: deterministic resume evidence derivation (pure, no DB/AI)
// ---------------------------------------------------------------------------

describe("Step 3 — resume evidence derivation", () => {
  test("A. extracts explicit skills, roles, years, education without fabrication", () => {
    const evidence = deriveResumeEvidenceFromText(
      "Senior Full Stack Developer at Acme Corp. 5+ years of experience. " +
        "Skilled in React, Node.js and TypeScript. Bachelor of Science in Computer Science."
    );

    expect(evidence.skills).toContain("TypeScript");
    expect(evidence.technologies).toContain("React");
    expect(evidence.technologies).toContain("Node.js");
    expect(evidence.roles.join(" ")).toMatch(/Developer/i);
    expect(evidence.yearsExperience).toBe(5);
    expect(evidence.education.some((e) => /bachelor/i.test(e.degree ?? ""))).toBe(true);
    expect(evidence.extraction.source).toBe("deterministic");
  });

  test("B. empty text yields empty evidence (no fabrication)", () => {
    const evidence = deriveResumeEvidenceFromText("   ");
    expect(evidence.skills).toEqual([]);
    expect(evidence.technologies).toEqual([]);
    expect(evidence.roles).toEqual([]);
    expect(evidence.yearsExperience).toBeNull();
  });

  test("C. a syntax-neutral unrelated resume never yields a false skill", () => {
    const evidence = deriveResumeEvidenceFromText(
      "Marketing manager with strong communication skills and 10 years of experience."
    );
    expect(evidence.skills).not.toContain("Rust");
    expect(evidence.skills).not.toContain("Kubernetes");
  });
});

// ---------------------------------------------------------------------------
// D–F: deterministic job-requirement extraction (pure, no DB/AI)
// ---------------------------------------------------------------------------

describe("Step 3 — job requirement extraction", () => {
  test("D. extracts required/preferred/experience/education/salary/remote/employment", () => {
    const reqs = deriveJobRequirementsFromDescription(
      [
        "Senior React Developer - fully remote, full-time.",
        "Requirements:",
        "- 5+ years experience with React and Node.js",
        "- Bachelor of Science in Computer Science",
        "Preferred:",
        "- Kubernetes",
        "Salary: $100,000 - $160,000 per year",
      ].join("\n")
    );

    expect(reqs.unavailable).toBe(false);
    expect(reqs.required.join(" ")).toMatch(/React/);
    expect(reqs.preferred.join(" ")).toMatch(/Kubernetes/);
    expect(reqs.experience?.years).toBe(5);
    expect(reqs.education?.field).toMatch(/Computer Science/i);
    expect(reqs.remote?.type).toBe("remote");
    expect(reqs.employment).toContain("full-time");
    expect(reqs.salary?.min).toBe(100000);
  });

  test("E. short/unusable description is flagged unavailable (no assumption)", () => {
    const reqs = deriveJobRequirementsFromDescription("hiring");
    expect(reqs.unavailable).toBe(true);
    expect(reqs.required).toEqual([]);
    expect(reqs.experience).toBeNull();
  });

  test("F. prepareMatchJob wires requirements and educationRequirement into the payload", () => {
    const payload = prepareMatchJob({
      title: "Senior React Developer",
      companyName: "Acme",
      description:
        "Requirements:\n- 5+ years experience with React\n- Bachelor of Science in Computer Science",
      locations: ["Remote"],
      remoteType: "remote",
      employmentType: "full-time",
      experienceLevel: "senior",
      salaryMin: 100000,
      salaryMax: 160000,
      salaryCurrency: "USD",
      salaryPeriod: "yearly",
      skills: ["React"],
      technologies: ["React"],
      jobUrl: "https://x.io",
      extractedRequirements: null,
    } as never);

    expect(payload.requirements).toBeTruthy();
    expect(payload.requirements!.unavailable).toBe(false);
    expect(payload.educationRequirement?.field).toMatch(/Computer Science/i);
  });
});

// ---------------------------------------------------------------------------
// G–I: resume upload / download HTTP flow (real GridFS on in-memory Mongo)
// ---------------------------------------------------------------------------

describe("Step 3 — resume upload/download", () => {
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n" +
      "4 0 obj\n<< /Length 44 >>\nstream\n" +
      "BT /F1 12 Tf 72 720 Td (Full Stack Developer 5 years React) Tj ET\n" +
      "endstream\nendobj\n" +
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n" +
      "trailer\n<< /Root 1 0 R /Size 6 >>\n%%EOF\n"
  );

  test("G. upload stores file + bounded content + evidence; safe response hides raw text and file id", async () => {
    const { token, user } = await registerUser();
    const resume = await Resume.create({
      user: user.id as string,
      title: "My Resume",
      fileName: "before.pdf",
      isActive: true,
    });

    const res = await request(app)
      .post(`/api/resumes/${resume._id}/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfBytes, "resume.pdf");

    expect(res.status).toBe(200);
    expect(res.body.resume.hasFile).toBe(true);
    // Privacy: raw extracted text and internal file id are never exposed.
    expect(res.body.resume.content.text).toBeUndefined();
    expect(res.body.resume.fileId).toBeUndefined();
    expect(res.body.resume.content).toHaveProperty("length");

    const stored = await Resume.findById(resume._id);
    expect(stored).not.toBeNull();
    expect(stored!.fileId).toBeTruthy();
    expect(stored!.mimeType).toBe("application/pdf");
    expect(stored!.content).toHaveProperty("text");
  });

  test("H. download returns the stored bytes (auth, ownership-checked)", async () => {
    const { token, user } = await registerUser();
    const resume = await Resume.create({
      user: user.id as string,
      title: "My Resume",
      fileName: "before.pdf",
      isActive: true,
    });
    await request(app)
      .post(`/api/resumes/${resume._id}/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfBytes, "resume.pdf")
      .expect(200);

    const dl = await request(app)
      .get(`/api/resumes/${resume._id}/file`)
      .set("Authorization", `Bearer ${token}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toContain("pdf");
  });

  test("I. other users cannot download someone else's resume", async () => {
    const { token, user } = await registerUser();
    const resume = await Resume.create({
      user: user.id as string,
      title: "Private",
      fileName: "private.pdf",
      isActive: false,
    });
    await request(app)
      .post(`/api/resumes/${resume._id}/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("not-a-docx"), "private.docx")
      .expect(200);

    const { token: otherToken } = await registerSecondUser();
    const dl = await request(app)
      .get(`/api/resumes/${resume._id}/file`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(dl.status).toBe(404);
  });

  test("J. unsupported file type is rejected with 415", async () => {
    const { token, user } = await registerUser();
    const resume = await Resume.create({
      user: user.id as string,
      title: "My Resume",
      fileName: "before.pdf",
      isActive: false,
    });
    const res = await request(app)
      .post(`/api/resumes/${resume._id}/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("junk"), "resume.txt");
    expect(res.status).toBe(415);
  });
});

// ---------------------------------------------------------------------------
// K–L: AI failure paths fall back safely (env-neutral, mock rejects)
// ---------------------------------------------------------------------------

describe("Step 3 — AI failure fallbacks", () => {
  test("K. AI resume evidence failure returns deterministic evidence (never throws)", async () => {
    const claudeClient = require("../src/integrations/claude/claudeClient");
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    const def = process.env.DEFAULT_AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEFAULT_AI_PROVIDER;
    try {
      claudeClient.analyzeProject.mockRejectedValueOnce(new Error("down"));
      const evidence = await deriveResumeEvidenceWithAI("React and Node.js");
      expect(evidence).toBeNull();
      expect(deriveResumeEvidenceFromText("React and Node.js").extraction.source).toBe(
        "deterministic"
      );
    } finally {
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
      if (def) process.env.DEFAULT_AI_PROVIDER = def;
    }
  });

  test("L. AI job-requirement failure falls back to deterministic result", async () => {
    const claudeClient = require("../src/integrations/claude/claudeClient");
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    const def = process.env.DEFAULT_AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEFAULT_AI_PROVIDER;
    try {
      claudeClient.analyzeProject.mockRejectedValueOnce(new Error("down"));
      const reqs = await deriveJobRequirementsWithAI(
        "Requirements:\n- 5+ years React"
      );
      expect(reqs).toBeNull();
      // Deterministic baseline is still available and safe.
      expect(deriveJobRequirementsFromDescription("Requirements:\n- 5+ years React").unavailable).toBe(
        false
      );
    } finally {
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
      if (def) process.env.DEFAULT_AI_PROVIDER = def;
    }
  });
});
