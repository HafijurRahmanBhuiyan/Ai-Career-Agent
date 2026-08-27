# AI Career Agent

A personal AI-powered career automation platform built with the MERN stack.

## Purpose

AI Career Agent automates career-related workflows including GitHub project analysis, LinkedIn post generation, job discovery, job matching, and career email classification — all powered by Claude AI with human-in-the-loop approval.

## Technology Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, React Router
- **Backend:** Node.js, Express.js, TypeScript
- **Database:** MongoDB, Mongoose
- **AI:** Anthropic Claude API
- **Automation:** n8n

## Current Milestone

**Milestone 6: Job Discovery Platform**

- Provider-agnostic `JobSource` abstraction with a bundled deterministic `MockJobSource`
- Job normalization: title/company/location cleaning, `http(s)`-only URL validation, description capped at 10,000 chars, enum coercion
- Two-level deduplication: unique `source + sourceJobId` compound index, plus deterministic SHA-256 fingerprint fallback
- Atomic upsert-backed discovery (`bulkWrite`) that updates mutable fields and keeps `discoveredAt` stable; per-source failure isolation with source reports
- Global/shared job store (not user-scoped) but all job APIs are authentication-required
- Filters: keywords (regex-escaped to prevent NoSQL/regex injection), location, remote type, employment type, experience level; page/limit with `limit` max 50
- Per-user discovery throttle on `POST /discover`
- Frontend Jobs dashboard with search, discovery, pagination, and job detail view
- 25 new automated tests (177 total passing)

**Milestone 6 (Job Discovery) is implemented.**

LinkedIn, Gmail, job matching/scoring and job automation are **NOT** yet implemented.

## Project Structure

```
ai-career-agent/
├── client/          # React frontend
├── server/          # Express backend
├── n8n/             # n8n workflow definitions
├── docs/            # Documentation
├── package.json     # Root scripts
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js >= 18
- npm >= 9
- MongoDB >= 6.0 (local or Atlas)

## Local Development

### Setup

```bash
# Install all dependencies
npm run install:all

# Copy environment variable files
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Environment Variables

Edit `server/.env` and set:

- `MONGODB_URI` — MongoDB connection string (e.g., `mongodb://localhost:27017/ai-career-agent`)
- `JWT_SECRET` — A strong random string for JWT signing
- `JWT_EXPIRES_IN` — Token expiration (default: `7d`)
- `GITHUB_CLIENT_ID` — GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App client secret
- `GITHUB_CALLBACK_URL` — OAuth callback URL (e.g., `http://localhost:5001/api/github/callback`)
- `GITHUB_TOKEN_ENCRYPTION_KEY` — 64-character hex string for AES-256 token encryption
- `ANTHROPIC_API_KEY` — Anthropic Claude API key (server-side only, never exposed)
- `CLAUDE_MODEL` — Claude model (e.g., `claude-sonnet-4-20250514`)
- `CLAUDE_MAX_TOKENS` — Max output tokens for analysis (default: `4096`)

See `server/.env.example` for the full list.

### Running

```bash
# Start MongoDB (if running locally)
mongod

# Start both frontend and backend
npm run dev

# Or start individually
npm run server    # Backend on port 5001
npm run client    # Frontend on port 5173
```

### Testing

```bash
# Run backend tests (uses in-memory MongoDB, no real DB needed)
cd server && npm test
```

## API Endpoints

### Authentication

| Method | Endpoint               | Description       | Auth Required |
|--------|------------------------|-------------------|---------------|
| POST   | `/api/auth/register`   | Register new user | No            |
| POST   | `/api/auth/login`      | Login             | No            |
| GET    | `/api/auth/me`         | Get current user  | Yes           |
| GET    | `/api/health`          | Health check      | No            |

### Profile

| Method | Endpoint          | Description     | Auth Required |
|--------|-------------------|-----------------|---------------|
| GET    | `/api/profile`    | Get profile     | Yes           |
| POST   | `/api/profile`    | Create profile  | Yes           |
| PATCH  | `/api/profile`    | Update profile  | Yes           |

### Education

| Method | Endpoint                | Description          | Auth Required |
|--------|-------------------------|----------------------|---------------|
| GET    | `/api/education`        | List education       | Yes           |
| POST   | `/api/education`        | Create education     | Yes           |
| GET    | `/api/education/:id`    | Get specific record  | Yes           |
| PATCH  | `/api/education/:id`    | Update record        | Yes           |
| DELETE | `/api/education/:id`    | Delete record        | Yes           |

### Experience

| Method | Endpoint                  | Description          | Auth Required |
|--------|---------------------------|----------------------|---------------|
| GET    | `/api/experience`         | List experience      | Yes           |
| POST   | `/api/experience`         | Create experience    | Yes           |
| GET    | `/api/experience/:id`     | Get specific record  | Yes           |
| PATCH  | `/api/experience/:id`     | Update record        | Yes           |
| DELETE | `/api/experience/:id`     | Delete record        | Yes           |

### Skills

| Method | Endpoint              | Description          | Auth Required |
|--------|-----------------------|----------------------|---------------|
| GET    | `/api/skills`         | List skills          | Yes           |
| POST   | `/api/skills`         | Create skill         | Yes           |
| GET    | `/api/skills/:id`     | Get specific skill   | Yes           |
| PATCH  | `/api/skills/:id`     | Update skill         | Yes           |
| DELETE | `/api/skills/:id`     | Delete skill         | Yes           |

### Projects

| Method | Endpoint                | Description          | Auth Required |
|--------|-------------------------|----------------------|---------------|
| GET    | `/api/projects`         | List projects        | Yes           |
| POST   | `/api/projects`         | Create project       | Yes           |
| GET    | `/api/projects/:id`     | Get specific project | Yes           |
| PATCH  | `/api/projects/:id`     | Update project       | Yes           |
| DELETE | `/api/projects/:id`     | Delete project       | Yes           |

### Resumes

| Method | Endpoint              | Description          | Auth Required |
|--------|-----------------------|----------------------|---------------|
| GET    | `/api/resumes`        | List resumes         | Yes           |
| POST   | `/api/resumes`        | Create resume        | Yes           |
| GET    | `/api/resumes/:id`    | Get specific resume  | Yes           |
| PATCH  | `/api/resumes/:id`    | Update resume        | Yes           |
| DELETE | `/api/resumes/:id`    | Delete resume        | Yes           |

### GitHub Integration

| Method | Endpoint                                        | Description                    | Auth Required |
|--------|-------------------------------------------------|--------------------------------|---------------|
| GET    | `/api/github/connect`                           | Get OAuth authorize URL        | Yes           |
| GET    | `/api/github/callback`                          | OAuth callback handler         | Yes           |
| POST   | `/api/github/disconnect`                        | Disconnect GitHub account      | Yes           |
| GET    | `/api/github/status`                            | Check connection status        | Yes           |
| GET    | `/api/github/repositories`                      | List GitHub repositories       | Yes           |
| GET    | `/api/github/repositories/imported`             | List imported repositories     | Yes           |
| POST   | `/api/github/repositories/:id/import`           | Import a repository            | Yes           |
| POST   | `/api/github/repositories/:id/sync`             | Sync imported repository       | Yes           |
| DELETE | `/api/github/repositories/:id`                  | Remove imported repository     | Yes           |
| GET    | `/api/github/repositories/:id/languages`        | Get repository languages       | Yes           |
| GET    | `/api/github/repositories/:id/readme`           | Get repository README          | Yes           |
| POST   | `/api/github/repositories/:id/analyze`          | Run AI project analysis        | Yes           |
| GET    | `/api/github/repositories/:id/analysis`         | Get latest analysis            | Yes           |
| GET    | `/api/github/repositories/:id/analyses`         | Get analysis history           | Yes           |
| POST   | `/api/github/repositories/:id/reanalyze`        | Re-analyze (new version)       | Yes           |

### Jobs

| Method | Endpoint              | Description                            | Auth Required |
|--------|-----------------------|----------------------------------------|---------------|
| GET    | `/api/jobs`           | Search/filter jobs (pagination)        | Yes           |
| POST   | `/api/jobs/discover`  | Fetch new jobs from sources            | Yes           |
| GET    | `/api/jobs/:id`       | Get a single job by id                 | Yes           |

## Job Discovery

### Architecture

Jobs are fetched through a provider-agnostic `JobSource` interface, registered in a central registry. A deterministic `MockJobSource` is bundled for local development and testing; real providers (e.g. Adzuna, Remotive, Greenhouse) can be added later by implementing the same interface.

```
JobSource (interface)
  └─ MockJobSource        # bundled deterministic source, id = "mock"

discoverJobs(params, sources)
  ├─ per-source isolation -> SourceReport[] (success/error + counts)
  ├─ normalizeJob(...)     # cleaning, URL safety, description cap, enum coercion
  ├─ deduplicateJobs(...)  # source+sourceJobId, then SHA-256 fingerprint
  └─ Job.bulkWrite(upsert) # persist atomically, update mutable fields + lastSeenAt
```

### Deduplication

- **Level 1:** unique compound index on `source + sourceJobId` — the primary identity for a job.
- **Level 2:** deterministic SHA-256 fingerprint (source, company, title, location, apply URL) used to collapse duplicates that share a source within a single discovery run.
- `discoveredAt` is preserved on re-discovery via `$setOnInsert`; `lastSeenAt` is refreshed each run.

### Security & Limits

- All job endpoints require authentication; the job store itself is global/shared, NOT user-scoped.
- `keywords` and location inputs are regex-escaped before use against MongoDB to prevent NoSQL/regex injection.
- Only `http`/`https` URLs are persisted for job/apply links; other schemes are stripped.
- `description` is truncated to 10,000 characters.
- `limit` is capped at 50; pagination via `page`/`limit`.
- `POST /discover` is rate-limited per user to prevent abuse.


## Claude AI Project Analysis

### Analysis Schema

Each project analysis produces a structured JSON result:

| Field | Type | Description |
|-------|------|-------------|
| `projectSummary` | string | Overview of the project |
| `problemStatement` | string | Problem the project solves |
| `keyFeatures` | string[] | Main features |
| `technologies` | string[] | All detected/inferred technologies |
| `programmingLanguages` | string[] | Languages used |
| `frameworks` | string[] | Frameworks and libraries |
| `databases` | string[] | Databases detected |
| `tools` | string[] | Development tools |
| `cloudServices` | string[] | Cloud platforms |
| `architecture` | string | Architecture description |
| `developmentHighlights` | string[] | Engineering practices |
| `skillsDemonstrated` | string[] | Developer skills shown |
| `difficultyLevel` | string | Beginner/Intermediate/Advanced |
| `developerRole` | string | Likely developer role |
| `resumeDescription` | string | Resume bullet point |
| `linkedinDescription` | string | LinkedIn description |
| `suggestedTags` | string[] | Discovery tags |

### Data Pipeline

For an imported repository, the analysis service collects:
- Repository metadata (name, description, language, topics, stars, forks, size)
- GitHub language statistics (deterministic, not guessed)
- README content (truncated to a safe maximum)

Only this data is sent to Claude. No `.env` files, private keys, passwords, or other repository contents are sent.

### Privacy & Security

- `ANTHROPIC_API_KEY` is stored only in server environment — never exposed or sent to the client
- GitHub access tokens are encrypted at rest and never returned
- Only necessary project information is sent to Claude
- No secrets, credentials, JWTs, or passwords are sent to Claude
- All analysis data is scoped per authenticated user (IDOR protected)

### Cost Safeguards

- README input limited to 15,000 characters (truncated with indication)
- `CLAUDE_MAX_TOKENS` caps output token usage
- No infinite retries on Claude failures
- No automatic background re-analysis — re-analysis is explicitly requested
- Re-analysis creates a new version without destroying history

## Status

This project is under active development. Features are being implemented incrementally through milestones.

## License

MIT
