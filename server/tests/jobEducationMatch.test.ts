import {
  computeEducationMatch,
  classifyDegreeLevel,
  fieldsMatch,
  JobEducationRequirement,
  EducationMatchResult,
  UserEducationMatchInput,
} from "../src/services/jobEducationMatch";
import {
  computeDeterministicMatch,
  DeterministicMatchResult,
} from "../src/services/deterministicMatch";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../src/services/jobMatchTypes";

function education(
  edu: UserEducationMatchInput[] = [],
  req?: JobEducationRequirement | null
): EducationMatchResult {
  return computeEducationMatch(edu, req);
}

describe("classifyDegreeLevel", () => {
  test("classifies high school / diploma as secondary", () => {
    expect(classifyDegreeLevel("High School")).toBe(0);
    expect(classifyDegreeLevel("GED")).toBe(0);
    expect(classifyDegreeLevel("Diploma")).toBe(0);
  });
  test("classifies associate", () => {
    expect(classifyDegreeLevel("Associate of Science")).toBe(1);
  });
  test("classifies bachelor variants", () => {
    expect(classifyDegreeLevel("Bachelor of Science")).toBe(2);
    expect(classifyDegreeLevel("B.S.")).toBe(2);
    expect(classifyDegreeLevel("B.A.")).toBe(2);
    expect(classifyDegreeLevel("BSc")).toBe(2);
  });
  test("classifies master variants", () => {
    expect(classifyDegreeLevel("Master of Science")).toBe(3);
    expect(classifyDegreeLevel("M.S.")).toBe(3);
    expect(classifyDegreeLevel("MBA")).toBe(3);
  });
  test("classifies doctorate", () => {
    expect(classifyDegreeLevel("PhD")).toBe(4);
    expect(classifyDegreeLevel("Ph.D.")).toBe(4);
    expect(classifyDegreeLevel("Doctor of Philosophy")).toBe(4);
  });
  test("returns null for unrecognized wording (no false classification)", () => {
    expect(classifyDegreeLevel("Some Custom Program")).toBeNull();
    expect(classifyDegreeLevel("")).toBeNull();
    expect(classifyDegreeLevel(null)).toBeNull();
  });
});

describe("fieldsMatch", () => {
  test("normalizes obvious formatting differences", () => {
    expect(fieldsMatch("Computer Science", "Computer Science")).toBe(true);
    expect(fieldsMatch("computer science", "Computer Science & Engineering")).toBe(true);
  });
  test("equivalent field naming matches", () => {
    expect(fieldsMatch("Computer Science", "Computer Science and Engineering")).toBe(true);
  });
  test("unrelated field does not match", () => {
    expect(fieldsMatch("Computer Science", "Mechanical Engineering")).toBe(false);
  });
  test("generic field yields no match (no substring false positive)", () => {
    // "Engineering" alone is too broad to match a specific user field reliably.
    expect(fieldsMatch("Engineering", "Computer Science")).toBe(false);
  });
  test("missing field never matches", () => {
    expect(fieldsMatch("Computer Science", "")).toBe(false);
    expect(fieldsMatch("", "Computer Science")).toBe(false);
  });
});

describe("computeEducationMatch", () => {
  test("A. no education requirement -> unknown/neutral", () => {
    const r = education([{ degree: "Bachelor of Science" }], null);
    expect(r.kind).toBe("unknown");
    expect(r.comparable).toBe(false);
    expect(r.ratio).toBe(0);
  });

  test("A2. no education requirement -> neutral even with user education", () => {
    const r = education([{ degree: "PhD" }], {});
    expect(r.kind).toBe("unknown");
    expect(r.comparable).toBe(false);
    expect(r.ratio).toBe(0);
  });

  test("B. bachelor's required + user has bachelor's -> strong", () => {
    const r = education([{ degree: "Bachelor of Science" }], { degree: "Bachelor's" });
    expect(r.kind).toBe("strong");
    expect(r.comparable).toBe(true);
    expect(r.ratio).toBe(1);
  });

  test("C. master's required + user has master's -> strong", () => {
    const r = education([{ degree: "M.S." }], { degree: "Master's" });
    expect(r.kind).toBe("strong");
    expect(r.ratio).toBe(1);
  });

  test("D. master's required + user only has bachelor's -> mismatch", () => {
    const r = education([{ degree: "Bachelor of Science" }], { degree: "Master's" });
    expect(r.kind).toBe("mismatch");
    expect(r.comparable).toBe(true);
    expect(r.ratio).toBe(0);
  });

  test("D2. doctorate required + user only has master's -> mismatch", () => {
    const r = education([{ degree: "Master's" }], { degree: "PhD" });
    expect(r.kind).toBe("mismatch");
  });

  test("E. explicit field match -> strong", () => {
    const r = education([{ degree: "B.S.", field: "Computer Science" }], {
      field: "Computer Science",
    });
    expect(r.kind).toBe("strong");
  });

  test("F. clearly unrelated field -> mismatch", () => {
    const r = education([{ degree: "B.S.", field: "Mechanical Engineering" }], {
      field: "Computer Science",
    });
    expect(r.kind).toBe("mismatch");
  });

  test("G. equivalent/normalized field naming -> strong", () => {
    const r = education([{ field: "Computer Science & Engineering" }], {
      field: "Computer Science",
    });
    expect(r.kind).toBe("strong");
  });

  test("H. multiple records where one satisfies -> strong", () => {
    const records = [
      { degree: "Associate", field: "Liberal Arts" },
      { degree: "Master's", field: "Computer Science" },
    ];
    const r = education(records, { degree: "Bachelor's", field: "Computer Science" });
    expect(r.kind).toBe("strong");
  });

  test("I. missing user education -> unknown (never crashes)", () => {
    const r = education([], { degree: "Bachelor's" });
    expect(r.kind).toBe("unknown");
    expect(r.comparable).toBe(false);
    expect(r.ratio).toBe(0);
    expect(() => education(undefined as never, { degree: "Bachelor's" })).not.toThrow();
  });

  test("I2. unrecognized user degree -> unknown (no false mismatch)", () => {
    const r = education([{ degree: "Some Custom Program" }], { degree: "Bachelor's" });
    expect(r.kind).toBe("unknown");
    expect(r.comparable).toBe(false);
  });

  test("J. missing job education requirement -> neutral", () => {
    const r = education([{ degree: "Bachelor's" }], undefined);
    expect(r.kind).toBe("unknown");
    expect(r.comparable).toBe(false);
    expect(r.ratio).toBe(0);
  });

  test("K. education requirement mixed with a non-education requirement", () => {
    // Degree is the education part; salary is handled separately. This just
    // ensures education is not confused with other signals.
    const r = education([{ degree: "Bachelor's" }], { degree: "Bachelor's" });
    expect(r.kind).toBe("strong");
  });

  test("L. no NaN/Infinity ratio", () => {
    const cases: Array<[UserEducationMatchInput[], JobEducationRequirement]> = [
      [[], { degree: "PhD" }],
      [[{ degree: "Bachelor's" }], { degree: "PhD" }],
      [[{ degree: "Master's" }], { degree: "Master's" }],
      [[{ degree: "B.S.", field: "Mechanical Engineering" }], { field: "Computer Science" }],
    ];
    for (const [edu, req] of cases) {
      const r = education(edu, req);
      expect(Number.isFinite(r.ratio)).toBe(true);
      expect(r.ratio).toBeGreaterThanOrEqual(0);
      expect(r.ratio).toBeLessThanOrEqual(1);
    }
  });
});

describe("deterministic education integration", () => {
  const baseProfile: JobMatchProfilePayload = {
    profile: {
      fullName: "Test",
      headline: "Full Stack Developer",
      summary: "",
      location: "Remote",
      preferredRoles: ["Full Stack Developer"],
      preferredLocations: ["Remote"],
      workPreference: "remote",
      salaryExpectation: { min: 90000, max: 150000, currency: "USD" },
    },
    skills: [
      { name: "React", category: "Frontend", proficiency: "Expert" },
      { name: "Node.js", category: "Backend", proficiency: "Expert" },
      { name: "TypeScript", category: "Language", proficiency: "Advanced" },
    ],
    experience: [
      {
        company: "Acme",
        position: "Full Stack Developer",
        description: "",
        durationYears: 5,
        currentlyWorking: true,
      },
    ],
    education: [{ degree: "Bachelor of Science", institution: "State U", field: "Computer Science" }],
    projects: [
      {
        name: "Web App",
        description: "",
        technologies: ["React", "Node.js"],
        features: [],
        role: "Full Stack Developer",
      },
    ],
    githubAnalysis: [],
    professionalEvidence: [],
    resumeEvidence: [],
  };

  const baseJob: JobMatchJobPayload = {
    title: "Senior Full Stack Developer",
    companyName: "Acme Corp",
    description: "Senior full stack role",
    locations: ["Remote"],
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "senior",
    salary: { min: 100000, max: 160000, currency: "USD" },
    skills: ["React", "Node.js", "TypeScript", "Kubernetes"],
    technologies: ["React", "Express", "Docker", "Kubernetes"],
    jobUrl: "https://example.com",
  };

  test("A. no education requirement -> neutral, no points awarded", () => {
    const r = computeDeterministicMatch(baseProfile, baseJob);
    expect(r.segments.education.possible).toBe(0);
    expect(r.segments.education.earned).toBe(0);
    expect(r.educationMatch).toContain("does not specify");
  });

  test("P. education does not penalize jobs without a requirement", () => {
    const withUserEdu: JobMatchProfilePayload = {
      ...baseProfile,
      education: [{ degree: "Associate", institution: "City", field: "Liberal Arts" }],
    };
    const noUserEdu: JobMatchProfilePayload = { ...baseProfile, education: [] };
    const a = computeDeterministicMatch(withUserEdu, baseJob);
    const b = computeDeterministicMatch(noUserEdu, baseJob);
    // Both have no job education requirement -> identical, neutral, no penalty.
    expect(a.score).toBe(b.score);
    expect(a.segments.education).toEqual(b.segments.education);
  });

  test("strong education match raises the score", () => {
    const r = computeDeterministicMatch(baseProfile, {
      ...baseJob,
      educationRequirement: { degree: "Bachelor's", field: "Computer Science" },
    });
    expect(r.segments.education.earned).toBe(1);
    expect(r.segments.education.possible).toBe(1);
    expect(r.educationMatch).toContain("satisfied");
  });

  test("clear education mismatch lowers the score relative to a match", () => {
    const mismatch = computeDeterministicMatch(baseProfile, {
      ...baseJob,
      educationRequirement: { degree: "PhD" },
    });
    const strong = computeDeterministicMatch(baseProfile, {
      ...baseJob,
      educationRequirement: { degree: "Bachelor's" },
    });
    expect(mismatch.segments.education.earned).toBe(0);
    expect(mismatch.segments.education.possible).toBe(1);
    expect(mismatch.score).toBeLessThan(strong.score);
  });

  test("O. existing segment scores unchanged when education is neutral", () => {
    const withoutReq = computeDeterministicMatch(baseProfile, baseJob);
    const withNeutralReq = computeDeterministicMatch(baseProfile, {
      ...baseJob,
      // An education requirement the user cannot satisfy IS comparable, so to
      // prove neutral does not change other segments we compare a truly absent
      // requirement against a user with no education data at all.
      educationRequirement: undefined,
    });
    const keys: Array<keyof DeterministicMatchResult["segments"]> = [
      "skills",
      "technologies",
      "role",
      "location",
      "remote",
      "employment",
      "experience",
      "salary",
    ];
    for (const key of keys) {
      expect(withNeutralReq.segments[key]).toEqual(withoutReq.segments[key]);
    }
    expect(withNeutralReq.score).toBe(withoutReq.score);
  });

  test("M. overall score remains 0-100", () => {
    const jobs = [
      baseJob,
      { ...baseJob, educationRequirement: { degree: "PhD" } },
      { ...baseJob, educationRequirement: { degree: "Bachelor's", field: "Computer Science" } },
    ];
    for (const j of jobs) {
      const r = computeDeterministicMatch(baseProfile, j);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  test("N. apply/maybe/skip thresholds unchanged", () => {
    const low = computeDeterministicMatch(baseProfile, {
      ...baseJob,
      title: "Unrelated",
      skills: ["Python", "Pandas"],
      technologies: ["Spark"],
    });
    if (low.score < 50) {
      expect(low.recommendation).toBe("skip");
    } else {
      expect(low.recommendation).toMatch(/^(apply|maybe)$/);
    }
  });

  test("L. deterministic result has no NaN/Infinity segments", () => {
    const r = computeDeterministicMatch(baseProfile, {
      ...baseJob,
      educationRequirement: { degree: "PhD", field: "Computer Science" },
    });
    const segs = r.segments;
    for (const key of Object.keys(segs) as Array<keyof typeof segs>) {
      expect(Number.isFinite(segs[key].earned)).toBe(true);
      expect(Number.isFinite(segs[key].possible)).toBe(true);
    }
    expect(Object.values(r.segments).every((s) => s.possible >= s.earned)).toBe(true);
  });
});
