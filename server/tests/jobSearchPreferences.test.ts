import { resolveDiscoveryParams } from "../src/services/jobSearchPreferences";
import { IProfile } from "../src/models/Profile";

type ProfileDoc = Pick<
  IProfile,
  "preferredRoles" | "preferredLocations" | "workPreference" | "jobSearchPreferences"
>;

function makeProfile(overrides: Partial<ProfileDoc> = {}): ProfileDoc {
  return {
    preferredRoles: [],
    preferredLocations: [],
    workPreference: "",
    ...overrides,
  };
}

describe("resolveDiscoveryParams", () => {
  test("A. jobSearchPreferences.roles used as keyword fallback when request has no roles/keywords", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: ["Frontend Engineer", "React Developer"],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.keywords).toBe("Frontend Engineer");
    expect(result.roles).toEqual(["Frontend Engineer", "React Developer"]);
  });

  test("B. explicit request keywords override saved preferences", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: ["Backend Engineer"],
        locations: ["London"],
        remote: "remote",
        experienceLevel: "senior",
        salaryMinimum: 80000,
      },
    });
    const result = resolveDiscoveryParams({ keywords: "DevOps" }, profile);
    expect(result.keywords).toBe("DevOps");
  });

  test("B2. explicit request roles override saved preferences", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: ["Backend Engineer"],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({ roles: ["DevOps Engineer"] }, profile);
    expect(result.roles).toEqual(["DevOps Engineer"]);
    expect(result.keywords).toBe("DevOps Engineer");
  });

  test("C. jobSearchPreferences.locations used when request has no locations", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: ["Seattle", "Portland"],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.locations).toEqual(["Seattle", "Portland"]);
  });

  test("D. explicit request locations override saved preferences", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: ["Seattle", "Portland"],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({ locations: ["Berlin"] }, profile);
    expect(result.locations).toEqual(["Berlin"]);
  });

  test("E. remote preference is respected from jobSearchPreferences", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "remote",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.remote).toBe("remote");
  });

  test("E2. remote preference 'any' does not override to a specific value", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.remote).toBeUndefined();
  });

  test("E3. explicit request remote overrides saved preference", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "remote",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({ remote: "onsite" }, profile);
    expect(result.remote).toBe("onsite");
  });

  test("F. experienceLevel preference is respected", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "senior",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.experienceLevel).toBe("senior");
  });

  test("F2. empty experienceLevel preference does not inject a value", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.experienceLevel).toBeUndefined();
  });

  test("G. salaryMinimum preference is respected", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: 95000,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.salaryMinimum).toBe(95000);
  });

  test("G2. null salaryMinimum preference does not inject a value", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.salaryMinimum).toBeUndefined();
  });

  test("H. legacy preferredRoles/preferredLocations/workPreference used when jobSearchPreferences is absent", () => {
    const profile = makeProfile({
      preferredRoles: ["Full Stack Developer"],
      preferredLocations: ["Remote"],
      workPreference: "remote",
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.keywords).toBe("Full Stack Developer");
    expect(result.roles).toEqual(["Full Stack Developer"]);
    expect(result.locations).toEqual(["Remote"]);
    expect(result.remote).toBe("remote");
  });

  test("H2. legacy fields are second priority after jobSearchPreferences", () => {
    const profile = makeProfile({
      preferredRoles: ["Backend Developer"],
      preferredLocations: ["New York"],
      workPreference: "onsite",
      jobSearchPreferences: {
        roles: ["Frontend Engineer"],
        locations: ["Seattle"],
        remote: "remote",
        experienceLevel: "senior",
        salaryMinimum: 100000,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.keywords).toBe("Frontend Engineer");
    expect(result.roles).toEqual(["Frontend Engineer"]);
    expect(result.locations).toEqual(["Seattle"]);
    expect(result.remote).toBe("remote");
  });

  test("I. empty jobSearchPreferences falls back to legacy fields", () => {
    const profile = makeProfile({
      preferredRoles: ["Data Engineer"],
      preferredLocations: ["Boston"],
      workPreference: "hybrid",
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.keywords).toBe("Data Engineer");
    expect(result.roles).toEqual(["Data Engineer"]);
    expect(result.locations).toEqual(["Boston"]);
    expect(result.remote).toBe("hybrid");
  });

  test("J. multiple roles are passed through correctly", () => {
    const profile = makeProfile({
      jobSearchPreferences: {
        roles: ["React Developer", "Frontend Engineer", "UI Engineer"],
        locations: ["Remote", "New York", "London"],
        remote: "remote",
        experienceLevel: "mid",
        salaryMinimum: 80000,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.roles).toEqual(["React Developer", "Frontend Engineer", "UI Engineer"]);
    expect(result.locations).toEqual(["Remote", "New York", "London"]);
    expect(result.keywords).toBe("React Developer");
  });

  test("K. null profile causes no crash and returns only request params", () => {
    const result = resolveDiscoveryParams({ keywords: "test" }, null);
    expect(result.keywords).toBe("test");
    expect(result.roles).toBeUndefined();
    expect(result.locations).toBeUndefined();
    expect(result.remote).toBeUndefined();
  });

  test("K2. undefined profile causes no crash and returns only request params", () => {
    const result = resolveDiscoveryParams({ keywords: "test" }, undefined);
    expect(result.keywords).toBe("test");
    expect(result.roles).toBeUndefined();
    expect(result.locations).toBeUndefined();
    expect(result.remote).toBeUndefined();
  });

  test("K3. profile with no jobSearchPreferences and no legacy fields causes no crash", () => {
    const profile = makeProfile();
    const result = resolveDiscoveryParams({}, profile);
    expect(result.keywords).toBeUndefined();
    expect(result.roles).toBeUndefined();
    expect(result.locations).toBeUndefined();
    expect(result.remote).toBeUndefined();
  });

  test("page and limit are passed through from request params", () => {
    const result = resolveDiscoveryParams({ page: 2, limit: 10 }, null);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  test("explicit request employmentType is passed through", () => {
    const result = resolveDiscoveryParams({ employmentType: "contract" }, null);
    expect(result.employmentType).toBe("contract");
  });

  test("legacy workPreference falls back when jobSearchPreferences.remote is 'any'", () => {
    const profile = makeProfile({
      preferredRoles: [],
      preferredLocations: [],
      workPreference: "hybrid",
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.remote).toBe("hybrid");
  });

  test("legacy workPreference empty string is treated as unset", () => {
    const profile = makeProfile({
      workPreference: "",
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: undefined,
      },
    });
    const result = resolveDiscoveryParams({}, profile);
    expect(result.remote).toBeUndefined();
  });
});
