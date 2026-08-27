import { JobSource, RawJob, JobSearchParams, JobSourceResult } from "../jobSource.types";

interface MockJobTemplate extends Omit<RawJob, "title" | "companyName"> {
  title: string;
  companies: string[];
  skills: string[];
  technologies: string[];
}

const JOB_TEMPLATES: MockJobTemplate[] = [
  {
    title: "Full Stack Developer",
    companies: ["Acme Corp", "Globex", "Initech", "Umbrella", "Stark Industries"],
    description:
      "We are looking for a Full Stack Developer to build and maintain web applications using React and Node.js. You will work on our core product, collaborating with cross-functional teams to deliver high-quality features.",
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "mid",
    salaryMin: 90000,
    salaryMax: 130000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    skills: ["JavaScript", "TypeScript", "React", "Node.js", "MongoDB"],
    technologies: ["React", "Node.js", "Express", "MongoDB", "Docker"],
    locations: ["Remote", "New York, NY"],
  },
  {
    title: "React Developer",
    companies: ["Wayne Enterprises", "Cyberdyne", "Vandelay Industries", "Pied Piper", "Acme Corp"],
    description:
      "Join our frontend team as a React Developer. You will build responsive, accessible user interfaces for our SaaS platform, working closely with designers and backend engineers.",
    remoteType: "hybrid",
    employmentType: "contract",
    experienceLevel: "junior",
    salaryMin: 50000,
    salaryMax: 70000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    skills: ["React", "JavaScript", "CSS", "HTML", "Redux"],
    technologies: ["React", "Redux", "Webpack", "Jest"],
    locations: ["San Francisco, CA", "Remote"],
  },
  {
    title: "Node.js Developer",
    companies: ["Globex", "Hooli", "Umbrella", "Wayne Enterprises", "Vandelay Industries"],
    description:
      "We need a Node.js Developer to design and build scalable backend services and APIs. Ideal candidates have experience with Express, database design, and cloud deployment.",
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "senior",
    salaryMin: 120000,
    salaryMax: 160000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    skills: ["Node.js", "JavaScript", "TypeScript", "SQL", "AWS"],
    technologies: ["Node.js", "Express", "PostgreSQL", "AWS", "Redis"],
    locations: ["Remote", "Austin, TX"],
  },
  {
    title: "Backend Engineer",
    companies: ["Initech", "Pied Piper", "Stark Industries", "Cyberdyne", "Acme Corp"],
    description:
      "Seeking a Backend Engineer to develop robust server-side systems, microservices, and data pipelines. Strong experience with distributed systems and message queues required.",
    remoteType: "onsite",
    employmentType: "full-time",
    experienceLevel: "senior",
    salaryMin: 130000,
    salaryMax: 170000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    skills: ["Python", "Java", "Kafka", "PostgreSQL", "Microservices"],
    technologies: ["Java", "Spring", "Kafka", "PostgreSQL", "Kubernetes"],
    locations: ["Seattle, WA"],
  },
  {
    title: "Software Engineer",
    companies: ["Hooli", "Stark Industries", "Umbrella", "Pied Piper", "Wayne Enterprises"],
    description:
      "Generalist Software Engineer needed to work across the stack. You will contribute to product development, write tests, and participate in code reviews.",
    remoteType: "hybrid",
    employmentType: "full-time",
    experienceLevel: "mid",
    salaryMin: 95000,
    salaryMax: 140000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    skills: ["TypeScript", "React", "Node.js", "Testing"],
    technologies: ["TypeScript", "React", "Node.js", "Jest", "GitHub Actions"],
    locations: ["Boston, MA", "Remote"],
  },
  {
    title: "Frontend Engineer",
    companies: ["Cyberdyne", "Vandelay Industries", "Initech", "Globex", "Hooli"],
    description:
      "Frontend Engineer with strong React and TypeScript skills to craft delightful user experiences. You will own component architecture and performance.",
    remoteType: "remote",
    employmentType: "part-time",
    experienceLevel: "entry",
    salaryMin: 40000,
    salaryMax: 55000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    skills: ["React", "TypeScript", "CSS", "Accessibility"],
    technologies: ["React", "Next.js", "Tailwind CSS", "Vite"],
    locations: ["Remote", "Denver, CO"],
  },
];

const sourceJobIdFor = (title: string, companyIndex: number): string =>
  `mock-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${companyIndex}`;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesParams(
  template: MockJobTemplate,
  companyIndex: number,
  params: JobSearchParams
): boolean {
  if (params.keywords) {
    const keywordPattern = escapeRegex(params.keywords.trim());
    const query = new RegExp(keywordPattern, "i");
    const titleMatches = query.test(template.title);
    const companyMatches = query.test(template.companies[companyIndex]);
    const skillMatches = template.skills.some((s) => query.test(s));
    const techMatches = template.technologies.some((t) => query.test(t));
    if (!titleMatches && !companyMatches && !skillMatches && !techMatches) return false;
  }

  if (params.locations && params.locations.length > 0) {
    const locationQuery = params.locations.join(" ").toLowerCase();
    const locationMatches = (template.locations || []).some((loc) =>
      loc.toLowerCase().includes(locationQuery)
    );
    if (!locationMatches) return false;
  }

  if (params.remote && params.remote !== "any" && template.remoteType !== params.remote) {
    return false;
  }

  if (params.employmentType && template.employmentType !== params.employmentType) {
    return false;
  }

  if (
    params.experienceLevel &&
    template.experienceLevel !== params.experienceLevel
  ) {
    return false;
  }

  if (params.salaryMinimum && (template.salaryMin ?? 0) < params.salaryMinimum) {
    return false;
  }

  return true;
}

export class MockJobSource implements JobSource {
  readonly id = "mock";
  readonly name = "Mock Job Source";

  async searchJobs(params: JobSearchParams): Promise<JobSourceResult> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 50);

    const results: RawJob[] = [];

    JOB_TEMPLATES.forEach((template, templateIndex) => {
      template.companies.forEach((company, companyIndex) => {
        const rawIndex = templateIndex * 10 + companyIndex;
        if (!matchesParams(template, companyIndex, params)) return;

        const postedOffsetDays = (rawIndex % 30) + 1;
        results.push({
          title: template.title,
          companyName: company,
          description: template.description,
          remoteType: template.remoteType,
          employmentType: template.employmentType,
          experienceLevel: template.experienceLevel,
          salaryMin: template.salaryMin,
          salaryMax: template.salaryMax,
          salaryCurrency: template.salaryCurrency,
          salaryPeriod: template.salaryPeriod,
          skills: template.skills,
          technologies: template.technologies,
          jobUrl: `https://example.com/jobs/${sourceJobIdFor(template.title, companyIndex)}`,
          applyUrl: `https://example.com/apply/${sourceJobIdFor(template.title, companyIndex)}`,
          locations: template.locations,
          location: template.locations?.[0] ?? null,
          postedAt: new Date(Date.now() - postedOffsetDays * 24 * 60 * 60 * 1000),
          rawData: { templateIndex, companyIndex },
        });
      });
    });

    const start = (page - 1) * limit;
    const pagedResults = results.slice(start, start + limit);

    return { jobs: pagedResults };
  }

  async healthCheck() {
    return { healthy: true, message: "Mock job source is available" };
  }
}
