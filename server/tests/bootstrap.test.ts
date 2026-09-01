import {
  selectJobSources,
  bootstrapJobSources,
} from "../src/integrations/jobs/bootstrap";
import {
  getSourceIds,
  getJobSource,
} from "../src/integrations/jobs/jobSourceRegistry";

describe("bootstrapJobSources - source selection", () => {
  it("registers Adzuna only when its API credentials are present", () => {
    const ids = selectJobSources({
      ADZUNA_APP_ID: "app-id",
      ADZUNA_APP_KEY: "app-key",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);

    expect(ids).toContain("adzuna");
    expect(ids).toContain("arbeitnow");
    expect(ids).toContain("remoteok");
  });

  it("skips Adzuna safely when API credentials are missing", () => {
    const ids = selectJobSources({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);

    expect(ids).not.toContain("adzuna");
    expect(ids).toContain("arbeitnow");
    expect(ids).toContain("remoteok");
  });

  it("registers Adzuna when only one credential is provided only if both are present", () => {
    const ids = selectJobSources({
      ADZUNA_APP_ID: "app-id",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);

    expect(ids).not.toContain("adzuna");
  });

  it("does not register the Mock source in production", () => {
    const ids = selectJobSources({
      NODE_ENV: "production",
      ADZUNA_APP_ID: "app-id",
      ADZUNA_APP_KEY: "app-key",
    } as NodeJS.ProcessEnv);

    expect(ids).not.toContain("mock");
    expect(ids).toContain("adzuna");
    expect(ids).toContain("arbeitnow");
    expect(ids).toContain("remoteok");
  });

  it("registers the Mock source outside production (test/development)", () => {
    const ids = selectJobSources({
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(ids).toContain("mock");
    expect(ids).toContain("arbeitnow");
    expect(ids).toContain("remoteok");
  });
});

describe("bootstrapJobSources - idempotency", () => {
  it("registers each source factory exactly once (no duplicates)", () => {
    const first = bootstrapJobSources({
      ADZUNA_APP_ID: "app-id",
      ADZUNA_APP_KEY: "app-key",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    const idsAfterFirst = getSourceIds();
    // No source id is registered more than once.
    expect(new Set(idsAfterFirst).size).toBe(idsAfterFirst.length);
    expect(idsAfterFirst.sort()).toEqual(first.sort());

    // Calling bootstrap again does not grow or change the registry.
    const second = bootstrapJobSources({
      ADZUNA_APP_ID: "app-id",
      ADZUNA_APP_KEY: "app-key",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(second.sort()).toEqual(first.sort());
    expect(getSourceIds().sort()).toEqual(idsAfterFirst.sort());
  });

  it("registers a usable factory for each advertised source id", () => {
    const ids = bootstrapJobSources({
      ADZUNA_APP_ID: "app-id",
      ADZUNA_APP_KEY: "app-key",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    for (const id of ids) {
      expect(getJobSource(id)).toBeDefined();
    }
  });
});
