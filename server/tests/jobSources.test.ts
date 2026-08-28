import { AdzunaJobSource } from "../src/integrations/jobs/sources/adzunaJobSource";
import { ArbeitnowJobSource } from "../src/integrations/jobs/sources/arbeitnowJobSource";
import { RemoteOkJobSource } from "../src/integrations/jobs/sources/remoteOkJobSource";
import { normalizeJob } from "../src/services/jobNormalization";

const defaultFetch = global.fetch;

function mockFetchOnce(payload: unknown) {
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue(response) as never;
}

function mockFetchThrows(message: string) {
  (global as { fetch: unknown }).fetch = jest
    .fn()
    .mockRejectedValue(new Error(message)) as never;
}

afterAll(() => {
  (global as { fetch: unknown }).fetch = defaultFetch as never;
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
  delete process.env.ADZUNA_COUNTRY;
});

describe("AdzunaJobSource", () => {
  beforeEach(() => {
    process.env.ADZUNA_APP_ID = "test-id";
    process.env.ADZUNA_APP_KEY = "test-key";
  });

  it("throws a not-configured error when keys are missing", async () => {
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
    const source = new AdzunaJobSource();
    await expect(source.searchJobs({})).rejects.toThrow(/not configured/i);
  });

  it("maps Adzuna results into raw jobs with a stable sourceJobId", async () => {
    mockFetchOnce({
      results: [
        {
          id: "129698749",
          title: "Senior Python Developer",
          description: "Remote friendly role",
          created: "2026-08-27T18:07:39Z",
          redirect_url: "https://adzuna.co.uk/jobs/land/ad/129698749",
          salary_min: 50000,
          salary_max: 55000,
          contract_time: "full_time",
          contract_type: "permanent",
          location: { display_name: "London", area: ["UK", "London"] },
          company: { display_name: "Acme Corp" },
        },
      ],
    });

    const source = new AdzunaJobSource();
    const result = await source.searchJobs({ keywords: "python", limit: 20 });
    expect(result.jobs).toHaveLength(1);

    const job = result.jobs[0];
    expect(job.title).toBe("Senior Python Developer");
    expect(job.companyName).toBe("Acme Corp");
    expect(job.remoteType).toBe("remote");
    expect(job.employmentType).toBe("full-time");

    const normalized = normalizeJob("adzuna", job);
    expect(normalized.sourceJobId).toBe("adzuna:129698749");
    expect(normalized.salaryMin).toBe(50000);
  });

  it("requests the configured country in the URL", async () => {
    process.env.ADZUNA_COUNTRY = "de";
    mockFetchOnce({ results: [] });
    const source = new AdzunaJobSource();
    await source.searchJobs({});
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/api/jobs/de/search/1?"),
      expect.anything()
    );
  });

  it("propagates network errors as HttpFetchError", async () => {
    mockFetchThrows("ECONNRESET");
    const source = new AdzunaJobSource();
    await expect(source.searchJobs({})).rejects.toThrow("ECONNRESET");
  });
});

describe("ArbeitnowJobSource", () => {
  it("maps Arbeitnow results and filters by keyword", async () => {
    mockFetchOnce({
      data: [
        {
          slug: "react-dev-berlin",
          title: "React Developer",
          company_name: "TechBerlin",
          location: "Berlin",
          remote: true,
          url: "https://www.arbeitnow.com/job/react-dev-berlin",
          description: "Building frontends in React",
          tags: ["react", "typescript"],
          job_types: ["full-time"],
        },
        {
          slug: "pizza-chef",
          title: "Pizza Chef",
          company_name: "Oven",
          location: "Berlin",
          remote: false,
          url: "https://www.arbeitnow.com/job/pizza-chef",
          description: "Cooking pizzas",
          tags: [],
          job_types: ["full-time"],
        },
      ],
    });

    const source = new ArbeitnowJobSource();
    const result = await source.searchJobs({ keywords: "react", limit: 20 });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("React Developer");
    expect(result.jobs[0].remoteType).toBe("remote");

    const normalized = normalizeJob("arbeitnow", result.jobs[0]);
    expect(normalized.sourceJobId).toBe("arbeitnow:react-dev-berlin");
  });

  it("is available without configuration", async () => {
    const source = new ArbeitnowJobSource();
    await expect(source.healthCheck()).resolves.toEqual({
      healthy: true,
      message: expect.any(String),
    });
  });
});

describe("RemoteOkJobSource", () => {
  it("skips the metadata object at index 0 and maps jobs", async () => {
    mockFetchOnce([
      { success: true, source: "RemoteOK" },
      {
        id: 12345,
        slug: "senior-backend",
        position: "Senior Backend Engineer",
        company: "RemoteCo",
        tags: ["node", "docker"],
        description: "Build backend services",
        location: "Worldwide",
        url: "https://remoteok.com/remote-jobs/senior-backend",
        apply_url: "https://boards.greenhouse.io/remoteco/jobs/1",
        date: "2026-08-27T10:00:00Z",
        salary_min: 100000,
        salary_max: 150000,
        salary_currency: "USD",
      },
    ]);

    const source = new RemoteOkJobSource();
    const result = await source.searchJobs({ limit: 20 });
    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0];
    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.remoteType).toBe("remote");
    expect(job.applyUrl).toBe("https://boards.greenhouse.io/remoteco/jobs/1");

    const normalized = normalizeJob("remoteok", job);
    expect(normalized.sourceJobId).toBe("remoteok:12345");
  });

  it("is available without configuration", async () => {
    const source = new RemoteOkJobSource();
    await expect(source.healthCheck()).resolves.toEqual({
      healthy: true,
      message: expect.any(String),
    });
  });
});
