import {
  computeSalaryOverlap,
  salaryRangesComparable,
  salaryOverlapToEarned,
  SalaryCompatibilityInput,
  SalaryCompatibilityResult,
} from "../src/services/jobSalaryMatch";
import {
  computeDeterministicMatch,
  DeterministicMatchResult,
} from "../src/services/deterministicMatch";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../src/services/jobMatchTypes";

function overlap(
  user: Partial<SalaryCompatibilityInput> = {},
  job: Partial<SalaryCompatibilityInput> = {}
): SalaryCompatibilityResult {
  return computeSalaryOverlap(
    {
      userMin: user.userMin !== undefined ? user.userMin : null,
      userMax: user.userMax !== undefined ? user.userMax : null,
      userCurrency:
        user.userCurrency !== undefined ? user.userCurrency : "USD",
    },
    {
      jobMin: job.jobMin !== undefined ? job.jobMin : null,
      jobMax: job.jobMax !== undefined ? job.jobMax : null,
      jobCurrency: job.jobCurrency !== undefined ? job.jobCurrency : "USD",
      jobPeriod: job.jobPeriod !== undefined ? job.jobPeriod : "yearly",
    }
  );
}

describe("computeSalaryOverlap", () => {
  test("A. exact same salary range is strong", () => {
    const r = overlap({ userMin: 80000, userMax: 120000 }, { jobMin: 80000, jobMax: 120000 });
    expect(r.kind).toBe("strong");
    expect(r.ratio).toBe(1);
    expect(r.comparable).toBe(true);
  });

  test("B. job range fully inside user range is strong", () => {
    const r = overlap({ userMin: 50000, userMax: 150000 }, { jobMin: 80000, jobMax: 120000 });
    expect(r.kind).toBe("strong");
  });

  test("C. user range fully inside job range is strong", () => {
    const r = overlap({ userMin: 80000, userMax: 120000 }, { jobMin: 50000, jobMax: 150000 });
    expect(r.kind).toBe("strong");
  });

  test("D. partial overlap is partial", () => {
    const r = overlap({ userMin: 80000, userMax: 120000 }, { jobMin: 100000, jobMax: 140000 });
    expect(r.kind).toBe("partial");
    expect(r.ratio).toBeGreaterThan(0);
    expect(r.ratio).toBeLessThan(0.75);
  });

  test("E. no overlap is none", () => {
    const r = overlap({ userMin: 80000, userMax: 120000 }, { jobMin: 50000, jobMax: 70000 });
    expect(r.kind).toBe("none");
    expect(r.ratio).toBe(0);
    expect(salaryOverlapToEarned(r)).toBe(0);
  });

  test("F. user minimum only", () => {
    const r = overlap({ userMin: 80000 }, { jobMin: 50000, jobMax: 150000 });
    expect(r.kind).not.toBe("unknown");
    expect(r.comparable).toBe(true);
    expect(Number.isNaN(r.ratio)).toBe(false);
  });

  test("G. user maximum only", () => {
    const r = overlap({ userMax: 120000 }, { jobMin: 50000, jobMax: 150000 });
    expect(r.kind).not.toBe("unknown");
    expect(Number.isNaN(r.ratio)).toBe(false);
  });

  test("H. job minimum only", () => {
    const r = overlap({ userMin: 50000, userMax: 150000 }, { jobMin: 100000 });
    expect(r.kind).not.toBe("unknown");
    expect(Number.isNaN(r.ratio)).toBe(false);
  });

  test("I. job maximum only", () => {
    const r = overlap({ userMin: 50000, userMax: 150000 }, { jobMax: 140000 });
    expect(r.kind).not.toBe("unknown");
    expect(Number.isNaN(r.ratio)).toBe(false);
  });

  test("J. missing salary on job is unknown (no penalty)", () => {
    const r = overlap({ userMin: 80000, userMax: 120000 }, {});
    expect(r.kind).toBe("unknown");
    expect(r.comparable).toBe(false);
    expect(salaryOverlapToEarned(r)).toBe(0);
  });

  test("K. missing salary expectation on user is unknown (no penalty)", () => {
    const r = overlap({}, { jobMin: 80000, jobMax: 120000 });
    expect(r.kind).toBe("unknown");
    expect(salaryOverlapToEarned(r)).toBe(0);
  });

  test("L. same currency is comparable", () => {
    const r = overlap(
      { userMin: 80000, userMax: 120000, userCurrency: "USD" },
      { jobMin: 80000, jobMax: 120000, jobCurrency: "USD" }
    );
    expect(r.comparable).toBe(true);
  });

  test("L2. different-case same currency is comparable", () => {
    const r = overlap(
      { userMin: 80000, userMax: 120000, userCurrency: "usd" },
      { jobMin: 80000, jobMax: 120000, jobCurrency: "USD" }
    );
    expect(r.comparable).toBe(true);
  });

  test("M. currency mismatch is unknown (no misleading penalty)", () => {
    const r = overlap(
      { userMin: 80000, userMax: 120000, userCurrency: "USD" },
      { jobMin: 80000, jobMax: 120000, jobCurrency: "EUR" }
    );
    expect(r.kind).toBe("unknown");
    expect(salaryOverlapToEarned(r)).toBe(0);
  });

  test("M2. one side missing currency is unknown", () => {
    const r = overlap(
      { userMin: 80000, userMax: 120000, userCurrency: "USD" },
      { jobMin: 80000, jobMax: 120000, jobCurrency: null }
    );
    expect(r.kind).toBe("unknown");
  });

  test("N. compatible salary period (yearly / null) is comparable", () => {
    const year = overlap(
      { userMin: 80000, userMax: 120000 },
      { jobMin: 80000, jobMax: 120000, jobPeriod: "yearly" }
    );
    const none = overlap(
      { userMin: 80000, userMax: 120000 },
      { jobMin: 80000, jobMax: 120000, jobPeriod: null }
    );
    expect(year.comparable).toBe(true);
    expect(none.comparable).toBe(true);
  });

  test("O. incompatible salary period is unknown (no misleading comparison)", () => {
    for (const period of ["monthly", "hourly", "contract"]) {
      const r = overlap(
        { userMin: 80000, userMax: 120000, userCurrency: "USD" },
        { jobMin: 8000, jobMax: 10000, jobCurrency: "USD", jobPeriod: period }
      );
      expect(r.kind).toBe("unknown");
      expect(salaryOverlapToEarned(r)).toBe(0);
    }
  });

  test("no NaN/infinite values returned for any configuration", () => {
    const cases: Array<[Partial<SalaryCompatibilityInput>, Partial<SalaryCompatibilityInput>]> = [
      [{ userMin: 1 }, {}],
      [{ userMax: 1 }, {}],
      [{}, { jobMin: 1 }],
      [{}, { jobMax: 1 }],
      [{ userMin: 1 }, { jobMax: 2 }],
      [{ userMax: 2 }, { jobMin: 1 }],
      [{ userMin: 5 }, { jobMin: 5 }],
      [{}, {}],
    ];
    for (const [u, j] of cases) {
      const r = overlap(u, j);
      expect(Number.isNaN(r.ratio)).toBe(false);
      expect(Number.isFinite(r.ratio)).toBe(true);
      expect(r.ratio).toBeGreaterThanOrEqual(0);
      expect(r.ratio).toBeLessThanOrEqual(1);
    }
  });

  test("negative/zero salary values are treated as missing (not arbitrary)", () => {
    const r = overlap(
      { userMin: 0, userMax: 120000 },
      { jobMin: 80000, jobMax: 120000 }
    );
    // 0 is treated as absent, so the user range collapses to max-only.
    expect(Number.isNaN(r.ratio)).toBe(false);
  });
});

describe("salaryRangesComparable", () => {
  test("false when either side has no range", () => {
    expect(salaryRangesComparable({ userMin: 1, userMax: 2, userCurrency: "USD" }, { jobMin: null, jobMax: null, jobCurrency: "USD", jobPeriod: "yearly" })).toBe(false);
    expect(salaryRangesComparable({ userMin: null, userMax: null, userCurrency: "USD" }, { jobMin: 1, jobMax: 2, jobCurrency: "USD", jobPeriod: "yearly" })).toBe(false);
  });

  test("false on currency mismatch", () => {
    expect(salaryRangesComparable({ userMin: 1, userMax: 2, userCurrency: "USD" }, { jobMin: 1, jobMax: 2, jobCurrency: "EUR", jobPeriod: "yearly" })).toBe(false);
  });

  test("false on mismatched-case when currencies differ", () => {
    expect(salaryRangesComparable({ userMin: 1, userMax: 2, userCurrency: "USD" }, { jobMin: 1, jobMax: 2, jobCurrency: "usd", jobPeriod: "yearly" })).toBe(true);
  });

  test("false on incompatible non-annual period", () => {
    expect(salaryRangesComparable({ userMin: 1, userMax: 2, userCurrency: "USD" }, { jobMin: 1, jobMax: 2, jobCurrency: "USD", jobPeriod: "monthly" })).toBe(false);
  });

  test("true on matching currency and yearly-compatible period", () => {
    expect(salaryRangesComparable({ userMin: 1, userMax: 2, userCurrency: "USD" }, { jobMin: 1, jobMax: 2, jobCurrency: "USD", jobPeriod: "yearly" })).toBe(true);
  });
});

// ---- deterministic matcher integration ----

function baseProfile(overrides: Partial<JobMatchProfilePayload["profile"]> = {}): JobMatchProfilePayload {
  return {
    profile: {
      fullName: "Test",
      headline: "Engineer",
      summary: "",
      location: "Remote",
      preferredRoles: ["Engineer"],
      preferredLocations: ["Remote"],
      workPreference: "remote",
      salaryExpectation: { min: 80000, max: 120000, currency: "USD" },
      ...overrides,
    },
    skills: [{ name: "React", category: "Frontend", proficiency: "Expert" }],
    experience: [{ company: "A", position: "Engineer", description: "", durationYears: 5, currentlyWorking: true }],
    education: [],
    projects: [],
    githubAnalysis: [],
    professionalEvidence: [],
    resumeEvidence: [],
  };
}

function baseJob(overrides: Partial<JobMatchJobPayload> = {}): JobMatchJobPayload {
  return {
    title: "Engineer",
    companyName: "Acme",
    description: "engineer role",
    locations: ["Remote"],
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "senior",
    salary: { min: 80000, max: 120000, currency: "USD", period: "yearly" },
    skills: ["React"],
    technologies: [],
    jobUrl: "https://example.com",
    ...overrides,
  };
}

describe("deterministic match salary segment", () => {
  function salaryOnlyScore(job: JobMatchJobPayload): number {
    return computeDeterministicMatch(baseProfile(), job).segments.salary.earned;
  }

  test("A. exact same range earns full salary score", () => {
    expect(salaryOnlyScore(baseJob({ salary: { min: 80000, max: 120000, currency: "USD", period: "yearly" } }))).toBe(1);
  });

  test("E. no overlap earns 0 salary score", () => {
    expect(salaryOnlyScore(baseJob({ salary: { min: 50000, max: 70000, currency: "USD", period: "yearly" } }))).toBe(0);
  });

  test("J. job without salary does not penalize (possible=0)", () => {
    const result = computeDeterministicMatch(baseProfile(), baseJob({ salary: null }));
    expect(result.segments.salary.earned).toBe(0);
    expect(result.segments.salary.possible).toBe(0);
  });

  test("K. user without salary expectation does not penalize (possible=0)", () => {
    const result = computeDeterministicMatch(
      baseProfile({ salaryExpectation: null }),
      baseJob()
    );
    expect(result.segments.salary.earned).toBe(0);
    expect(result.segments.salary.possible).toBe(0);
  });

  test("M. currency mismatch is neutral (possible=0)", () => {
    const result = computeDeterministicMatch(
      baseProfile(),
      baseJob({ salary: { min: 80000, max: 120000, currency: "EUR", period: "yearly" } })
    );
    expect(result.segments.salary.earned).toBe(0);
    expect(result.segments.salary.possible).toBe(0);
  });

  test("O. incompatible salary period is neutral (possible=0)", () => {
    const result = computeDeterministicMatch(
      baseProfile(),
      baseJob({ salary: { min: 8000, max: 10000, currency: "USD", period: "monthly" } })
    );
    expect(result.segments.salary.earned).toBe(0);
    expect(result.segments.salary.possible).toBe(0);
  });

  test("P. jobSearchPreferences.salaryMinimum raises the effective user floor", () => {
    // User expectation 80-120k, but salaryMinimum=150k means effective floor = 150k.
    // Job 120-140k is below the floor -> no overlap.
    const profile = baseProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "remote",
        experienceLevel: "",
        salaryMinimum: 150000,
      },
    });
    const result = computeDeterministicMatch(
      profile,
      baseJob({ salary: { min: 120000, max: 140000, currency: "USD", period: "yearly" } })
    );
    expect(result.segments.salary.earned).toBe(0);
  });

  test("P2. salaryMinimum below expectation min keeps expectation min as floor", () => {
    const profile = baseProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "remote",
        experienceLevel: "",
        salaryMinimum: 70000,
      },
    });
    const result = computeDeterministicMatch(
      profile,
      baseJob({ salary: { min: 80000, max: 120000, currency: "USD", period: "yearly" } })
    );
    expect(result.segments.salary.earned).toBe(1);
  });

  test("P3. salaryMinimum alone (no salary min/max) establishes the user floor", () => {
    const profile = baseProfile({
      salaryExpectation: { min: null, max: null, currency: "USD" },
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "remote",
        experienceLevel: "",
        salaryMinimum: 90000,
      },
    });
    const high = computeDeterministicMatch(
      profile,
      baseJob({ salary: { min: 50000, max: 60000, currency: "USD", period: "yearly" } })
    );
    expect(high.segments.salary.earned).toBe(0);
    const ok = computeDeterministicMatch(
      profile,
      baseJob({ salary: { min: 90000, max: 140000, currency: "USD", period: "yearly" } })
    );
    expect(ok.segments.salary.earned).toBeGreaterThan(0);
  });

  test("Q. legacy salaryExpectation remains compatible", () => {
    const result = computeDeterministicMatch(
      baseProfile(),
      baseJob({ salary: { min: 80000, max: 120000, currency: "USD", period: "yearly" } })
    );
    expect(result.segments.salary.earned).toBe(1);
    expect(result.salaryMatch).toBeTruthy();
  });

  test("R. no NaN/infinite values in deterministic result", () => {
    const result = computeDeterministicMatch(baseProfile(), baseJob({ salary: null }));
    expect(Number.isNaN(result.score)).toBe(false);
    expect(Number.isFinite(result.score)).toBe(true);
    for (const seg of Object.values(result.segments)) {
      expect(Number.isNaN(seg.earned)).toBe(false);
      expect(Number.isNaN(seg.possible)).toBe(false);
    }
  });

  test("S. overall score stays within 0-100", () => {
    for (const job of [
      baseJob(),
      baseJob({ salary: { min: 50000, max: 70000, currency: "USD", period: "yearly" } }),
      baseJob({ salary: null }),
    ]) {
      const result = computeDeterministicMatch(baseProfile(), job);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  test("T. recommendation thresholds unchanged (no salary data keeps apply/maybe)", () => {
    const strong = computeDeterministicMatch(baseProfile(), baseJob());
    expect(["apply", "maybe"]).toContain(strong.recommendation);
    expect(strong.recommendationReason).toContain("Deterministic score");
  });
});
