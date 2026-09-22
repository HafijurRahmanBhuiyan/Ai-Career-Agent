# AI Career Agent

A personal, AI-powered **career automation platform** built on the MERN stack. It connects a user's GitHub, Gmail, and LinkedIn accounts, analyzes real repositories, discovers and scores job opportunities, tracks applications end-to-end, and generates professional content and CV documents — all with a **multi-provider AI fallback chain** (Claude → Gemini → OpenAI → Groq → OpenRouter → Cerebras → Mistral, each backed by a pool of free models) and **strict human-in-the-loop approval** at every external side effect.

> **Live demo:** <https://ai-career-agent-1bn8.onrender.com>

---

## Table of Contents

- [Purpose](#purpose)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Testing](#testing)
- [Building for Production](#building-for-production)
- [API Overview](#api-overview)
- [GitHub Integration](#github-integration)
- [AI Project Analysis](#ai-project-analysis)
- [AI Provider Fallback & Free Model Pools](#ai-provider-fallback--free-model-pools)
- [AI Job Matching](#ai-job-matching)
- [Career Opportunity Feed](#career-opportunity-feed)
- [Job Discovery & Ingestion](#job-discovery--ingestion)
- [Application Tracking & Execution](#application-tracking--execution)
- [Gmail / Career Email Intelligence](#gmail--career-email-intelligence)
- [LinkedIn Content & Publishing](#linkedin-content--publishing)
- [CV Builder & PDF Generation](#cv-builder--pdf-generation)
- [Career Intelligence & Analytics](#career-intelligence--analytics)
- [Notifications & Settings](#notifications--settings)
- [n8n Scheduled Ingestion](#n8n-scheduled-ingestion)
- [Security & Privacy](#security--privacy)
- [Human-in-the-Loop Principles](#human-in-the-loop-principles)
- [Cost Safeguards](#cost-safeguards)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## Purpose

Searching for a job and preparing professional content is repetitive, manual work. AI Career Agent consolidates the whole workflow into one place:

- **Prove your work** — import real GitHub repositories, have AI analyze them, and turn approved projects into evidence-backed LinkedIn content.
- **Find the right roles** — ingest real job listings from multiple sources and rank them against your actual profile with a deterministic, explainable match score.
- **Stay on top of the pipeline** — track applications from saved → applied → interview → offer, sync career emails from Gmail (read-only), get interview intelligence and follow-up suggestions, and review analytics.
- **Produce documents** — build a structured CV and download a polished PDF.
- **Never automate blindly** — every external action (publishing, applying, emailing, status changes) requires explicit human approval.

---

## Features

- **Authentication** — JWT-based register/login, session restoration, and protected frontend routes.
- **Profile management** — user profile, education, experience, skills, projects, and resume documents (including PDF/DOCX upload with GridFS storage).
- **CV Builder ("Make CV")** — structured profile-driven CV with one-click **PDF download** (generated server-side with PDFKit; safe for any profile shape, including legacy/partial records).
- **GitHub integration** — OAuth connect, repository browsing/import/sync, languages, READMEs, **AI project analysis**, re-analysis with version history, and "approve for professional use" gating.
- **Professional content workflow** — deterministic professional evidence derived from validated analyses, AI-suggested LinkedIn post ideas, and a full **LinkedIn draft lifecycle** (draft → reviewed → approved → published).
- **LinkedIn publishing** — publish approved drafts to a real LinkedIn member timeline through the official Posts API (`w_member_social`).
- **Job discovery & ingestion** — real connectors for **Adzuna**, **Arbeitnow**, and **RemoteOK** (plus a deterministic mock source for development), normalized, de-duplicated, and persisted through one pipeline.
- **Career opportunity feed** — user-scoped, score-ranked feed with plain-language match explanations, apply capability (`external_url` / `supported_api` / `manual_required`), real handoff URLs, and save-to-application tracking. **No AI is called on feed load.**
- **AI job matching** — per-request AI match analysis on the fallback chain (cached) with a strictly validated 0–100 score and backend-owned match levels.
- **Application tracking** — saved/applied/screening/interview/offer/rejected/withdrawn statuses, per-application timeline, interview intelligence, AI summaries (cached), interview preparation, follow-ups (with assist), and a review → handoff → explicit-confirmation execution flow.
- **Career application analytics** — deterministic KPIs, funnel, conversion rates, time-to-stage metrics, stale-application detection, follow-up/preparation performance, company insights, and attention items. **No AI is called to compute analytics.**
- **Gmail / career email intelligence** — read-only Gmail sync, **conservative** AI classification (fallback chain) of career emails, interview detail extraction, and human-approved application-status updates. A best-effort **self-notification email** is sent only to the user's own address when an interview/upswing is detected (toggleable). The platform never sends or replies on the user's behalf.
- **Career intelligence dashboard** — a deterministic, no-AI aggregation of pipeline overview, attention items, upcoming interviews, recent status changes, career emails, activity, and next actions.
- **Notification center** — read-only aggregation of high-match opportunities, drafts needing review, handoffs to confirm, and notify-worthy career emails.
- **Settings** — per-source job-source status, job search preferences, and notification preferences.
- **Scheduled ingestion** — a bundled n8n workflow triggers job discovery every 6 hours (JWT-protected, rate-limited). No background workers/cron on the server itself.

---

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, Vite 6, TypeScript, Tailwind CSS, React Router 7, Axios |
| **Backend** | Node.js, Express 4, TypeScript, Zod (validation) |
| **Database** | MongoDB + Mongoose 8 (local or Atlas) |
| **AI** | Anthropic Claude (primary) + Gemini, OpenAI, Groq, OpenRouter, Cerebras, Mistral (fallbacks), each with a pool of free models; all server-side only |
| **Integrations** | GitHub OAuth, Google Gmail OAuth, LinkedIn OAuth (`w_member_social`), Adzuna / Arbeitnow / RemoteOK APIs |
| **Documents** | PDFKit (CV PDF), mammoth (DOCX text), pdf-parse (PDF text), multer + GridFS (upload storage) |
| **Automation** | n8n (scheduled job ingestion workflow) |
| **Security** | bcryptjs (password hashing), jsonwebtoken, AES-256-GCM (OAuth token encryption), helmet, express-rate-limit, CORS |
| **Testing** | Jest + Supertest + mongodb-memory-server (in-memory MongoDB) |

---

## How It Works

### Architecture overview

```
                       +----------------------------+
                       |  Client (React SPA)        |
                       |  React Router + Tailwind   |
                       +-------------+--------------+
                                     |  HTTPS / JSON  (Authorization: Bearer JWT)
                                     v
                       +-------------+--------------+
                       |  Express API  (server)     |
                       |  routes -> controllers ->  |
                       |  services -> models (Mongo)|
                       +----+----+----+----+----+---+
                            |    |    |    |    |
              +-------------+    |    |    +--------------+
              v                  v    v                   v
        +-----------+     +-----------+  +-----------+   +-----------+
        | GitHub    |     | AI router |  |  Gmail    |   | LinkedIn  |
        | (OAuth,   |     | Claude ·  |  | (read +   |   | (OAuth,   |
        |  repos,   |     | Gemini ·  |  |  self-    |   |  posts)   |
        |  analyses)|     | OpenAI ·  |  |  notify)  |   |           |
        +-----------+     | Groq · …  |  +-----------+   +-----------+
                          +-----------+        |
                                      +--------+-----------+
                                      | Job sources:       |
                                      | Adzuna · Arbeitnow |
                                      | RemoteOK · Mock    |
                                      +--------------------+
```

> The "AI router" is a server-side fallback chain: **claude → gemini → openai → groq → openrouter → cerebras → mistral**, where each provider tries its **pool of free models** in priority order before the next provider. See [AI Provider Fallback & Free Model Pools](#ai-provider-fallback--free-model-pools).

### Core request flow

1. **Auth & token management.** The user registers/logs in with email + password. The server returns a signed JWT; the client stores it in `sessionStorage` and attaches it via an Axios interceptor to every request. On any `401`, the token is cleared and the user is redirected to `/login`.
2. **OAuth connections.** GitHub, Gmail, and LinkedIn follow the same pattern: the server returns a signed authorize URL (`/connect`), the provider redirects back to `/callback`, the server validates a single-use signed state, exchanges the code for tokens, and stores them **encrypted at rest** (`select: false` in MongoDB). GitHub access tokens are automatically refreshed when near expiry; Gmail access tokens auto-refresh with an offline refresh token and degrade to `isActive=false` if revoked.
3. **AI analysis (all server-side).** The backend builds a bounded input payload (repository metadata + README, or profile + job, or email body, or application data), calls the AI router (`analyzeWithAIFallback`, primary Claude with automatic fallback to Gemini, OpenAI, Groq, OpenRouter, Cerebras, and Mistral — each provider tries every enabled free model before the next provider), strictly validates the JSON output with Zod, and persists only validated results. No secrets, passwords, or `.env` content ever reach the AI.
4. **Human-in-the-loop execution.** AI output is always treated as a **suggestion** (e.g. `suggestedApplicationStatus`, draft ideas, fit assessment). External side effects happen only after explicit user action: approving a repository, approving a draft, confirming `{ submitted: true }` for an application, or choosing a status in the Gmail detail modal. Backend-owned statuses and levels are never supplied by the AI.

### Data pipeline (jobs)

```
JobSource (interface)
  ├─ MockJobSource      # deterministic source for dev/tests (id = "mock")
  ├─ AdzunaJobSource    # keyed (ADZUNA_APP_ID / ADZUNA_APP_KEY)
  ├─ ArbeitnowJobSource # keyless, always enabled
  └─ RemoteOkJobSource  # keyless, always enabled

discoverJobs(params, sources)
  ├─ per-source isolation -> SourceReport[] (success/error + counts)
  ├─ normalizeJob(...)    # cleaning, URL safety, description cap, enum coercion
  ├─ deduplicateJobs(...) # source+sourceJobId, then SHA-256 fingerprint
  └─ Job.bulkWrite(upsert)# persist atomically, update mutable fields + lastSeenAt
```

### Application lifecycle

```
saved → applied → screening → interview → offer
              \→ rejected / withdrawn
```

- One application per user per job (duplicate → 409).
- Status history is recorded automatically as immutable `system` events; Gmail-derived events (e.g. `interview_scheduled`, `offer_received`) are recorded idempotently; the user can add/edit/delete their own `user` events.
- Applications **only** advance to `applied` after the user explicitly confirms they submitted (`POST /api/applications/:id/execution` with `{ submitted: true }`).

---

## Project Structure

```
ai-career-agent/
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── api/                 # Central Axios instance + interceptors
│   │   ├── components/          # Auth layout, dashboard layout, guards, modals
│   │   ├── context/             # AuthContext (single auth source of truth)
│   │   ├── pages/               # Landing, Login, Register, Dashboard, Jobs,
│   │   │                        #   Opportunities, Job Matches, Applications,
│   │   │                        #   Follow-ups, Analytics, Career Emails,
│   │   │                        #   GitHub Integrations, Connections,
│   │   │                        #   Professional Content, Make CV, Profile,
│   │   │                        #   Settings, Privacy Policy
│   │   ├── services/            # API service modules (auth, applications)
│   │   ├── types/               # Shared frontend TypeScript types
│   │   └── utils/               # apiError, tokenStorage, match helpers
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts           # Dev proxy to backend (:5173 -> :5001)
│
├── server/                      # Express backend (TypeScript)
│   ├── src/
│   │   ├── config/              # index.ts (PORT/NODE_ENV/secret), database.ts
│   │   ├── controllers/         # Request/response handlers (per feature)
│   │   ├── integrations/        # External service clients
│   │   │   ├── ai/              # aiRouter (provider + free-model fallback),
│   │   │   │                    #   aiModelRegistry (verified free-model pools),
│   │   │   │                    #   aiErrorClassifier, Gemini, OpenAI, OpenAI-compatible clients
│   │   │   ├── claude/          # Claude client + parse/validation helpers
│   │   │   ├── github/          # GitHub OAuth client + service
│   │   │   ├── gmail/           # Gmail OAuth + read-only client
│   │   │   ├── jobs/            # JobSource interface + Adzuna/Arbeitnow/RemoteOK
│   │   │   └── linkedin/        # LinkedIn OAuth + publishing client
│   │   ├── middleware/          # auth, authorize, upload, profileUpload, errorHandler
│   │   ├── models/              # Mongoose models (User, Profile, Job, Application,
│   │   │                        #   CareerEmail, GitHubConnection, LinkedInDraft, ...)
│   │   ├── routes/              # Express routers (mounted in app.ts)
│   │   ├── services/            # Business logic (matching, analytics, CV PDF,
│   │   │                        #   notifications, resume handling, ...)
│   │   ├── types/               # Express augmentation + ambient declarations
│   │   ├── utils/               # encryption, jwt, oauthState, password
│   │   ├── validators/          # Zod schemas (`.strict()` where required)
│   │   ├── app.ts               # Express app + route mounting
│   │   └── server.ts            # Entry point (connect DB + listen)
│   ├── tests/                   # Jest + Supertest suites (48+ files)
│   ├── .env.example
│   └── package.json
│
├── n8n/                         # n8n workflow definitions
│   └── workflows/
│       └── job-ingestion-workflow.json   # Scheduled job discovery (6h)
│
├── package.json                 # Root scripts (dev, build, test, typecheck)
└── .gitignore
```

---

## Prerequisites

- **Node.js** >= 18 (developed against Node 22/26)
- **npm** >= 9
- **MongoDB** >= 6.0 (local or MongoDB Atlas) — tests use an in-memory server, no DB needed
- API keys/credentials for the integrations you want to enable (all optional except `JWT_SECRET`):
  - At least one AI provider key (all optional except `JWT_SECRET`): Claude (`ANTHROPIC_API_KEY`) recommended, or any of Gemini/OpenAI/Groq/OpenRouter/Cerebras/Mistral — required for any AI feature
  - GitHub OAuth app — required for GitHub integration
  - Google Cloud OAuth (Gmail) — required for Gmail integration
  - LinkedIn OAuth app — required for LinkedIn publishing
  - Adzuna app credentials — optional job source

---

## Local Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd ai-career-agent

# 2. Install all dependencies (root + server + client)
npm run install:all

# 3. Configure environment variables
cp server/.env.example server/.env
cp client/.env.example client/.env

# 4. Edit server/.env — at minimum set:
#    MONGODB_URI, JWT_SECRET, and ANTHROPIC_API_KEY (see next section)
```

Start MongoDB locally if you are not using Atlas:

```bash
mongod
```

---

## Environment Variables

All values are read from `server/.env`. A full template lives in `server/.env.example`.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Backend port (default `5001`) |
| `MONGODB_URI` | yes | MongoDB connection string (e.g. `mongodb://localhost:27017/ai-career-agent`) |
| `JWT_SECRET` | yes | Strong random string used to sign JWTs |
| `JWT_EXPIRES_IN` | no | Token lifetime (default `7d`) |
| `NODE_ENV` | no | `development` / `production` / `test` |
| `CLIENT_URL` | no | Frontend origin for CORS (default `http://localhost:5173`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub only | GitHub OAuth App credentials |
| `GITHUB_CALLBACK_URL` | GitHub only | e.g. `http://localhost:5001/api/github/callback` |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | GitHub only | 64-character hex AES-256 key used to encrypt stored OAuth tokens |
| `ANTHROPIC_API_KEY` | AI features | Anthropic Claude API key (server-side only, never exposed). Any configured provider key enables AI features |
| `CLAUDE_MODEL` | no | Claude model identifier (default `claude-sonnet-4-6`) |
| `CLAUDE_MAX_TOKENS` | no | Max output tokens for analysis (default `4096`) |
| `GEMINI_API_KEY` | no | Gemini API key (free Flash/Flash-Lite model pool) |
| `GEMINI_MODEL` / `GEMINI_FREE_MODELS` | no | Optional single-model override / comma-separated free-model pool override (replaces registry defaults) |
| `OPENAI_API_KEY` | no | OpenAI API key (fallback; single model `gpt-4o-mini`) |
| `GROQ_API_KEY` / `GROQ_MODEL` / `GROQ_FREE_MODELS` | no | Groq key + optional model/free-pool overrides (free developer plan) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` / `OPENROUTER_FREE_MODELS` | no | OpenRouter key + optional model/free-pool overrides (free collection) |
| `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` / `CEREBRAS_FREE_MODELS` | no | Cerebras key + optional model/free-pool overrides (free = time-bounded trial) |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` / `MISTRAL_FREE_MODELS` | no | Mistral key + optional model/free-pool overrides (free Experiment tier) |
| `DEFAULT_AI_PROVIDER` | no | Starting provider for the fallback chain (default: first configured provider) |
| `JOB_MATCH_CACHE_HOURS` | no | Job-match cache window (default `168`) |
| `JOB_MATCH_MAX_DESCRIPTION_CHARS` | no | Matching description cap (default `10000`) |
| `APPLICATION_SUMMARY_CACHE_HOURS` | no | AI summary cache window (default `168`) |
| `APPLICATION_STALE_DAYS` | no | Days before an active application is flagged stale (default `7`) |
| `JOB_STALE_DAYS` | no | Days since `lastSeenAt` before a job is soft-deactivated (default `14`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail only | Google Cloud OAuth credentials |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_CALLBACK_URL` | Gmail only | e.g. `http://localhost:5001/api/gmail/callback` |
| `GOOGLE_GMAIL_SCOPES` | no | Defaults to read + `gmail.send` (used **only** for read + self-notify) |
| `GMAIL_SYNC_MAX_RESULTS` | no | Max emails fetched per sync (default `25`) |
| `GMAIL_SYNC_LOOKBACK_MINUTES` | no | How far back each sync scans (clamped `[60, 10080]`, default `1440`) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn only | LinkedIn OAuth App credentials |
| `LINKEDIN_CALLBACK_URL` | LinkedIn only | e.g. `http://localhost:5001/api/linkedin/callback` |
| `LINKEDIN_API_VERSION` | no | LinkedIn API version `YYYYMM` (default `202605`) |
| `LINKEDIN_SCOPES` | no | Default `openid profile email w_member_social` |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | no | Adzuna credentials (optional; skipped gracefully when missing) |
| `ADZUNA_COUNTRY` | no | Adzuna country code (default `gb`) |
| `JOB_API_KEY` / `JOB_SEARCH_URL` | no | Legacy job-search configuration (optional) |

The client uses `client/.env` with `VITE_API_URL` (default `http://localhost:5001/api`). In development the Vite proxy forwards `/api` to the backend, so this is usually not needed locally.

> **Security note:** never commit real `.env` files. `.env` is git-ignored; only `.env.example` is committed.

---

## Running Locally

```bash
# Run both backend and frontend concurrently
npm run dev

# ...or run them individually
npm run server    # Backend on http://localhost:5001
npm run client    # Frontend on http://localhost:5173
```

Health check: `http://localhost:5001/api/health`

---

## Testing

Backend tests run against an **in-memory MongoDB** — no real database required.

```bash
# Full server test suite (Jest + Supertest)
npm test

# Type checking
npm run typecheck          # Server + client
```

The suite is large (~47 suites / 900+ tests) and covers auth, ownership/IDOR protection, strict Zod validation, deduplication, OAuth flows, PDF generation, and the human-in-the-loop boundaries for every feature.

---

## Building for Production

```bash
# Build both client and server
npm run build               # = client (tsc -b && vite build) + server (tsc -> dist/)

# Start the production server (reads dist/)
npm run server -- --prefix server
# or
cd server && npm start      # node dist/server.js
```

Serve the built `client/dist/` with any static host; the API is served by `server/dist/`. The live demo runs on **Render**.

---

## API Overview

All authenticated endpoints require `Authorization: Bearer <JWT>`. User-scoped resources return `404` for another user's or non-existent IDs (IDOR-safe); strict Zod schemas return `422` for unknown/invalid fields; unauthenticated requests return `401`; the global rate limiter (`500 req / 15 min`) is bypassed only when `NODE_ENV === "test"`.

### System & Auth

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Health check | No |
| POST | `/api/auth/register` | Register a new user | No |
| POST | `/api/auth/login` | Log in | No |
| GET | `/api/auth/me` | Get the current user | Yes |

### Profile, Education, Experience, Skills, Projects, Resumes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET/POST/PATCH | `/api/profile` | Read/create/update the user profile | Yes |
| GET/POST | `/api/education`, `/api/experience`, `/api/skills`, `/api/projects` | List/create records | Yes |
| GET/PATCH/DELETE | `/:id` on each of the above | Read/update/delete one record | Yes |
| GET/POST | `/api/resumes` | List resumes / create a resume | Yes |
| GET/PATCH/DELETE | `/api/resumes/:id` | Read/update/delete one resume | Yes |
| POST | `/api/resumes/:id/document` | Upload a resume document (PDF/DOCX, stored in GridFS) | Yes |

### CV Builder

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET/POST | `/api/cv` | List user CVs / create a CV profile | Yes |
| GET/PATCH/DELETE | `/api/cv/:id` | Read/update/delete a CV profile | Yes |
| GET | `/api/cv/:id/generate-pdf` | Download the CV as a PDF (PDFKit, safe for partial profiles) | Yes |

### GitHub Integration

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/github/connect` | Get the OAuth authorize URL | Yes |
| GET | `/api/github/callback` | OAuth callback (stores encrypted, refreshable tokens) | Yes |
| POST | `/api/github/disconnect` | Disconnect the GitHub account | Yes |
| GET | `/api/github/status` | Connection status + token health | Yes |
| GET | `/api/github/repositories` | List the user's GitHub repositories | Yes |
| GET | `/api/github/repositories/imported` | List imported repositories | Yes |
| POST | `/api/github/repositories/:id/import` | Import (persist) a repository | Yes |
| POST | `/api/github/repositories/:id/sync` | Refresh an imported repository | Yes |
| DELETE | `/api/github/repositories/:id` | Remove an imported repository | Yes |
| GET | `/api/github/repositories/:id/languages` | Languages with byte counts (deterministic) | Yes |
| GET | `/api/github/repositories/:id/readme` | Repository README (404-safe) | Yes |
| POST | `/api/github/repositories/:id/analyze` | Run AI project analysis (validated, versioned) | Yes |
| GET | `/api/github/repositories/:id/analysis` | Latest analysis | Yes |
| GET | `/api/github/repositories/:id/analyses` | Analysis history | Yes |
| POST | `/api/github/repositories/:id/reanalyze` | Force a fresh analysis (new version) | Yes |
| POST | `/api/github/repositories/:id/approve` | Approve or revoke a project for professional use `{ approved }` | Yes |
| POST | `/api/github/repositories/:id/professional-evidence` | Derive professional evidence (requires approval; deterministic) | Yes |
| GET | `/api/github/repositories/:id/professional-evidence` | Get evidence for a repository | Yes |
| PATCH | `/api/github/repositories/:id/professional-evidence` | Update (clarify) evidence fields | Yes |
| POST | `/api/github/repositories/:id/linkedin-draft/assist` | AI suggests 1–3 post ideas (review only, not persisted) | Yes |

### LinkedIn Content & Publishing

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET/POST | `/api/projects/linkedin-drafts` | List/save LinkedIn drafts (requires approved evidence) | Yes |
| GET/PATCH | `/api/projects/linkedin-drafts/:id` | Read/update a draft | Yes |
| POST | `/api/projects/linkedin-drafts/:id/approve` | Mark reviewed → approved ("Ready to Publish") | Yes |
| POST | `/api/projects/linkedin-drafts/:id/archive` | Archive a draft | Yes |
| POST | `/api/projects/linkedin-drafts/:id/publish` | Publish via the LinkedIn Posts API (sets `published` only on real external success) | Yes |
| GET | `/api/linkedin/connect` / `/api/linkedin/status` / `POST /api/linkedin/disconnect` | LinkedIn OAuth management | Yes |
| GET | `/api/linkedin/callback` | OAuth callback (validates state, redirects to `/dashboard/integrations?linkedin=connected`) | Yes |

**Draft lifecycle:** `draft → reviewed → approved → publishing → published` (or `publish_failed` on failure; `archived`). Publish success requires a real 200/201/204 with a `urn:li:` post id. The agent never auto-publishes and never auto-retries.

### Jobs & Opportunities

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/jobs` | Search/filter jobs (pagination) | Yes |
| POST | `/api/jobs/discover` | Fetch new jobs from configured sources (rate-limited 20/15min) | Yes |
| POST | `/api/jobs/ingest` | Ingest validated listings (strict schema, URL-safe, key-stripping, dedupe) | Yes |
| GET | `/api/jobs/opportunities` | User-scoped, score-ranked feed with explanations (no AI on load) | Yes |
| GET | `/api/jobs/opportunities/:id` | Opportunity detail (explanation, apply capability, `alreadyApplied`) | Yes |
| GET | `/api/jobs/:id` | Single job | Yes |
| POST | `/api/jobs/:id/match` | AI match analysis (cached or fresh) | Yes |
| GET | `/api/jobs/:id/match` | Existing cached match | Yes |
| POST | `/api/jobs/:id/match/reanalyze` | Force fresh match analysis | Yes |
| GET | `/api/job-matches` | List the user's matches (filters, pagination) | Yes |

### Applications

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/applications` | Track a job as an application | Yes |
| GET | `/api/applications` | List applications (page/limit/status) | Yes |
| GET | `/api/applications/analytics` | Career analytics (`range` 7d–all, deterministic, no AI) | Yes |
| GET | `/api/applications/follow-ups` | Global follow-up inbox across applications | Yes |
| GET/PATCH/DELETE | `/api/applications/:id` | Read/update/delete one application | Yes |
| GET/POST | `/api/applications/:id/timeline` | List/add timeline events | Yes |
| PATCH/DELETE | `/api/applications/:id/timeline/:eventId` | Update/delete user-sourced events | Yes |
| GET/POST/PUT | `/api/applications/:id/summary` | Get/generate/regenerate the cached AI summary | Yes |
| GET/PUT | `/api/applications/:id/preparation` | Read/upsert interview preparation | Yes |
| POST | `/api/applications/:id/preparation/assist` | AI prep suggestions (never auto-saves) | Yes |
| GET/POST | `/api/applications/:id/follow-ups` | List/create follow-ups | Yes |
| POST | `/api/applications/:id/follow-ups/assist` | AI follow-up suggestions (never auto-saves) | Yes |
| PATCH/DELETE | `/api/applications/:id/follow-ups/:followUpId` | Update/complete/delete a follow-up | Yes |
| GET | `/api/applications/:id/execution` | Read-only execution view (capability + handoff URL) | Yes |
| POST | `/api/applications/:id/execution/prepare` | Review phase; **never changes status** | Yes |
| POST | `/api/applications/:id/execution` | Handoff; **`applied` only when `{ submitted: true }`** | Yes |
| POST | `/api/applications/:id/fit-assist` | AI job-fit assessment (advisory only) | Yes |

### Gmail / Career Email Intelligence

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/gmail/connect` / `/api/gmail/status` / `POST /api/gmail/disconnect` | Gmail OAuth management | Yes |
| GET | `/api/gmail/callback` | OAuth callback (redirects to frontend) | Yes |
| POST | `/api/gmail/sync` | Sync + classify career emails (optional `max` 1–100) | Yes |
| GET | `/api/gmail/emails` | List career email intelligence (filters/sort) | Yes |
| GET | `/api/gmail/emails/:id` | One career email intelligence record | Yes |
| POST | `/api/gmail/emails/:id/apply-status` | Explicitly update the linked application status | Yes |

### Dashboard, Notifications, Settings

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard/career-intelligence` | Deterministic career intelligence aggregation (no AI) | Yes |
| GET | `/api/notification-center` | Read-only notification feed | Yes |
| POST | `/api/notification-center/seen` | Mark notifications as seen | Yes |
| GET | `/api/settings` | Job-source status + search/notification preferences (keys never leaked) | Yes |

---

## GitHub Integration

- **Connection.** OAuth connect → callback → state validation → token exchange → persistence with **AES-256-GCM encryption** (`select: false`). GitHub now also stores `refresh_token` / expiry fields so that access tokens **auto-refresh** when nearing expiry (with a single-flight refresh guard) — repositories continue to load without repeated disconnects. One-time reconnect is required for accounts connected before refresh tokens were stored.
- **Repositories.** Browse the connected account's repos, import the ones you own, and sync changes. Language stats and READMEs come directly from the GitHub API.
- **Errors are user-friendly.** GitHub API failures are mapped to readable errors (401 → "reconnect your GitHub account", 403/429 → rate-limit messaging) and never surface as opaque 500s.

---

## AI Project Analysis

For each imported repository the service collects **repository metadata, GitHub language statistics (deterministic), and the README (truncated to a safe max)** — nothing else is sent to the AI. No `.env` files, private keys, passwords, tokens, or other repository contents ever leave the server.

The validated, versioned analysis schema:

| Field | Type | Description |
|-------|------|-------------|
| `projectSummary` / `problemStatement` | string | Overview and problem solved |
| `keyFeatures` | string[] | Main features |
| `technologies` / `programmingLanguages` / `frameworks` / `databases` / `tools` / `cloudServices` | string[] | Detected stack |
| `architecture` | string | Architecture description |
| `developmentHighlights` | string[] | Engineering practices |
| `skillsDemonstrated` | string[] | Developer skills |
| `difficultyLevel` | string | Beginner / Intermediate / Advanced |
| `developerRole` | string | Likely developer role |
| `resumeDescription` / `linkedinDescription` | string | Ready-to-use copy |
| `suggestedTags` | string[] | Discovery tags |

Re-analysis creates a **new version** without destroying history; it only runs when explicitly requested.

---

## AI Provider Fallback & Free Model Pools

Every AI feature calls the **AI router** (`analyzeWithAIFallback` → `analyzeWithProviderFallback`), which resolves the actual model server-side and falls back in a fixed order:

> **claude → gemini → openai → groq → openrouter → cerebras → mistral**

Each provider exposes a **pool of free models** (tried in priority order, `server-side only`). Models within one provider share the same API key and quota — exhausting one model's rate limit never inflates capacity; only the next model or provider is attempted. The chain is bounded (no infinite retries) and never fabricates a result when everything fails.

| Provider | Free model pool (priority order) |
|----------|----------------------------------|
| **Claude** | `claude-sonnet-4-6` (single model) |
| **Gemini** | `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3-flash-preview` (free tier = Flash/Flash-Lite family only) |
| **OpenAI** | `gpt-4o-mini` (single model) |
| **Groq** | `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen/qwen3.8-27b` → `qwen/qwen3.6-27b` (free developer plan) |
| **OpenRouter** | `openrouter/free` (dynamic router) → `nvidia/nemotron-3-ultra-550b-a55b:free` → `thinkingmachines/inkling:free` → `nvidia/nemotron-3-super-120b-a12b:free` → `nvidia/nemotron-3.5-lightning:free` → `thinkingmachines/inkling-small:free` → `dots-studio/dots-3-note-preview:free` → `cohere/north-mini-code:free` → `poolside/laguna-s-2.1:free` (free collection) |
| **Cerebras** | `gpt-oss-120b` → `gemma-4-31b` (free = time-bounded trial, not a permanent tier) |
| **Mistral** | `mistral-small-latest` → `mistral-medium-latest` (free Experiment tier, rate-limited, ~1B tokens/month cap) |

**Model selection** is config-driven and resolved server-side; the frontend only exposes provider-level choice:

1. Per-request `model` (set by the router internally) — highest priority.
2. Legacy single-model override `<PROVIDER>_MODEL` (e.g. `GEMINI_MODEL`).
3. `<PROVIDER>_FREE_MODELS` — a comma-separated list that **replaces** the built-in defaults for that provider; leave empty to use the verified defaults above.

**When does the chain advance?** Only capacity/provider-side errors move on — model not found/unavailable, 429 / rate limit, quota / free-tier / daily limits, overload, 5xx, and timeouts. Application/config errors (invalid API key, invalid input/schema/request) stop the chain immediately and are surfaced to the user — never papered over by cycling models.

---

## AI Job Matching

1. `prepareMatchProfile(userId)` loads profile, skills (≤50), experience (≤15), education (≤10), projects (≤10), and GitHub analyses (≤8) in parallel, with completeness flags.
2. `prepareMatchJob` prepares the job and truncates the description (`JOB_MATCH_MAX_DESCRIPTION_CHARS`, default 10,000).
3. `analyzeJobMatch` returns a cached valid `JobMatch` for `user + job` if one exists within `JOB_MATCH_CACHE_HOURS` (default 168); otherwise it calls the AI router (full fallback chain), strictly validates the output (Zod), derives the match level **on the backend**, and stores the result.
4. The job description is treated as **untrusted** — the system prompt instructs the model to never follow instructions inside it.

**Score → match level** (backend-owned, AI never supplies the level):

| Score | matchLevel |
|-------|------------|
| 90–100 | `strong_match` |
| 75–89 | `good_match` |
| 60–74 | `partial_match` |
| 0–59 | `weak_match` |

---

## Career Opportunity Feed

`GET /api/jobs/opportunities` is a **user-scoped, fully deterministic** feed:

- Ranked by match score (desc) → freshness (desc) → `_id` tie-breaker, with pagination (default 20, max 100).
- Each item carries a `score`, `matchLevel`, a plain-language `explanation[]`, matching/missing skills and technologies, an `applyCapability`, and a real `handoffUrl`.
- `alreadyApplied` is derived per authenticated user.
- **No AI call on load** — the feed never creates `JobMatch` records, never auto-applies, and never changes status. Browsing the feed is cheap and reproducible.

---

## Job Discovery & Ingestion

- **Discovery:** `POST /api/jobs/discover` runs every configured `JobSource`, isolating failures per source (a source that is not configured reports `status: "error"` and is skipped — the rest of the pipeline keeps working).
- **Ingestion:** `POST /api/jobs/ingest` accepts strictly-validated listings (unknown fields like `userId`/`ownerId` → 422; only `http(s)` URLs persisted; sensitive keys stripped from `rawSource`).
- **Normalization & deduplication:** primary identity is `source + sourceJobId` (unique compound index), backed by a SHA-256 fingerprint (source/company/title/location/apply URL). `discoveredAt` is preserved via `$setOnInsert`; `lastSeenAt` refreshes each run.
- **Deactivation:** jobs unseen for `JOB_STALE_DAYS` are soft-deactivated (`isActive: false`) — never hard-deleted.

---

## Application Tracking & Execution

- **Statuses:** `saved → applied → screening → interview → offer` (plus `rejected` / `withdrawn`); one application per user per job.
- **Timeline:** immutable `system` events (created, status changes), idempotent `gmail` events derived from message ids, and editable `user` events.
- **Interview intelligence:** `CareerEmail.interview` stores only explicitly-stated details (`scheduledAt`, interviewer, meeting URL, location); nothing is inferred from received dates.
- **AI summary:** grounded only in the job, application, timeline, related emails, latest match, and profile; cached until the state hash changes.
- **Execution (human-in-the-loop):** the execution view shows the capability and the real handoff URL. `{ submitted: true }` is the **only** action that records `applied`. Job-fit assist never changes status.

---

## Gmail / Career Email Intelligence

- **OAuth** with `access_type=offline` + `prompt=consent` so a refresh token is obtained; tokens encrypted at rest.
- **Sync pipeline:** keyword pre-filter → bounded fetch → dedupe → body extraction (capped) → relevance check → AI classification (fallback chain) → persist `CareerEmail`.
- **Classification categories:** `recruiter_outreach`, `application_received`, `application_update`, `interview_invitation`, `interview_reschedule`, `assessment`, `rejection`, `offer`, `follow_up`, `networking`, `unrelated`.
- **Conservative matching:** an email links to an application only when normalized company + title match exactly one of the user's applications (no match or ambiguous → `application: null`).
- **Human-in-the-loop:** syncing never changes an application status; the UI shows the AI suggestion separately and the user must explicitly confirm before `POST .../apply-status` applies it.
- **Read + self-notify only:** the `gmail.send` scope exists solely for a best-effort self-notification email (interview/upswing detected) to the user's own `Profile.notificationEmail`, gated by `gmailNotifyEnabled`. The platform never sends, replies, deletes, or auto-applies.

---

## LinkedIn Content & Publishing

1. **Approve a project** (`Approve for professional use`).
2. **Derive professional evidence** deterministically from the validated `ProjectAnalysis` + verified repo facts — no second AI call, no fabrication.
3. **Generate draft ideas** — AI proposes hook/body/hashtags (review-only, never persisted automatically).
4. **Review & approve** the draft (`Reviewed` → `Approved — Ready to Publish`).
5. **Publish** via the official LinkedIn Posts API (`POST https://api.linkedin.com/rest/posts`) with a real `urn:li:` post id. Publishing is never automatic; failures preserve the draft and are marked `publish_failed`.

---

## CV Builder & PDF Generation

The **Make CV** page lets users assemble a structured CV from their profile data and download it as a PDF.

- Server-side PDF generation with **PDFKit** (`server/src/services/cvPdf.ts`).
- The generator is **defensive**: it renders any stored profile shape — including legacy/partial records missing `personalInfo` or other sections — without crashing, so "Download PDF" never returns an internal server error.
- The controller uses a safe filename and returns a friendly message if generation fails for any other reason.

---

## Career Intelligence & Analytics

- **Dashboard** (`GET /api/dashboard/career-intelligence`): pipeline overview (single `$group` aggregation), attention items, upcoming interviews (from explicit future `scheduledAt` only), recent status changes (reconstructed from chronological events), recent career emails, merged recent activity (bounded), and next actions. Deterministic, no AI, read-only.
- **Analytics** (`GET /api/applications/analytics?range=...`): KPIs, funnel, conversion rates (never divided by zero), time-to-stage average/median, stale applications, follow-up + interview-preparation performance, top-company insights, and typed attention items — all computed from persisted data with no extra analytics records.

---

## Notifications & Settings

- **Notification center:** read-only aggregation of items seen since `Profile.notificationsSeenAt` — high-match opportunities (score ≥ 75), drafts needing review/approval, unconfirmed handoffs, and notify-worthy career emails. Marking "seen" never mutates other data.
- **Settings:** `GET /api/settings` reports each job source's configured status (never revealing keys) and the profile's job-search + notification preferences, editable through `PATCH /api/profile`.

---

## n8n Scheduled Ingestion

To keep the opportunity feed fresh automatically, import the bundled n8n workflow (`n8n/workflows/job-ingestion-workflow.json`):

1. Start the server (`npm run dev` in `server/`).
2. Configure job sources in `server/.env` (Adzuna optional; Arbeitnow + RemoteOK always enabled; `mock` always available locally).
3. In n8n, create an **HTTP Header Auth** credential: header `Authorization`, value `Bearer <JWT>` (get a JWT via `POST /api/auth/login`).
4. Import the workflow (Workflows → Import from File) and connect the credential to the **Trigger job discovery** node.
5. Optionally edit the target URL/body (roles, locations, remote preference, `limit`, `page`).
6. Activate the workflow — it runs every **6 hours**.

The node POSTs `{ roles, locations, remote, experienceLevel, salaryMinimum, limit, page }` to `POST /api/jobs/discover` and returns a per-source report:

```json
{
  "jobs": [],
  "count": 12,
  "sources": [
    { "source": "mock", "status": "success", "count": 6 },
    { "source": "adzuna", "status": "error", "message": "Adzuna is not configured..." },
    { "source": "arbeitnow", "status": "success", "count": 4 },
    { "source": "remoteok", "status": "success", "count": 2 }
  ]
}
```

`status: "error"` for unconfigured sources is expected and proves graceful degradation. This workflow contains **no LinkedIn** — it only fetches job listings.

---

## Security & Privacy

- **JWT auth** on every protected endpoint; resources are always scoped to `req.user!.id` — no user id is accepted from the client and cross-user/unknown IDs return `404` (ownership is never leaked).
- **Secrets never leave the server:** passwords are bcrypt-hashed, OAuth tokens are AES-256-GCM-encrypted at rest with `select: false`, and the Anthropic key / GitHub client secrets / encryption keys are never returned to or stored by the client.
- **Strict validation:** Zod schemas across all inputs; unknown query/body fields → 422; regex-escaped keyword searches prevent NoSQL injection; only `http(s)` URLs are persisted; sensitive keys are stripped from stored payloads.
- **Rate limiting** on public and discovery/ingest endpoints (bypassed only in tests); **helmet**, CORS restricted to `CLIENT_URL`.
- **Bounded workflows:** READMEs (15k chars) and job descriptions (10k chars) are capped before reaching the AI; no email bodies beyond `MAX_BODY_CHARS`; pagination limits everywhere; no unbounded queries.
- **No scraping / no browser automation** anywhere in the codebase.

---

## Human-in-the-Loop Principles

The agent is deliberately constrained so AI output is advice, never action:

- **No auto-publish.** LinkedIn posts require explicit `approve` + `publish`.
- **No auto-apply.** Applications advance to `applied` only after the user confirms submission.
- **No outbound email.** Gmail is read + self-notify only, and only to the user's own address.
- **No auto status changes.** AI stores `suggestedApplicationStatus`; only the explicit apply-status endpoint (or user-confirmed execution) changes an application status.
- **No second matcher / no background AI.** The feed and dashboards are deterministic; AI is called only on explicit user actions (through the fallback chain) and cached thereafter.
- **No cron/queues on the server.** Scheduled work is delegated to the n8n workflow.

---

## Cost Safeguards

- Output token caps (`CLAUDE_MAX_TOKENS`) and bounded inputs to every AI call.
- Job-match and application-summary results are **cached** against unchanged state.
- Re-analysis and re-matching are explicit (a fresh run replaces the old record, history preserved).
- Language stats are read from GitHub (never guessed); analytics are computed locally (no AI).
- No infinite retries; provider fallback is bounded (claude → gemini → openai → groq → openrouter → cerebras → mistral), each provider tries its free-model pool in priority order before the next provider.

---

## Troubleshooting

| Symptom | Likely cause & fix |
|---------|--------------------|
| "401" / "Request failed with status code 401" on GitHub | Access token expired/revoked. If the account predates refresh-token storage, **disconnect and reconnect once**; then tokens auto-refresh. |
| "429" on job discovery/ingest | Rate limit (20 req/15 min). Wait and retry. |
| "Adzuna is not configured" in the source report | Missing `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`. Expected — Adzuna is skipped gracefully. |
| CV "Download PDF" error | Should not happen after the defensive PDF generator; check `server/.env` and restart. Contact logs will show the `errorHandler` stack. |
| Jobs not updating despite n8n | The discoverer de-duplicates; a repeat run may surface few/no new records. That is expected. |
| `JWT_SECRET is not defined` | Set `JWT_SECRET` in `server/.env`. |
| Tests fail on machine | Run `npm test` in `server/` (uses in-memory MongoDB); ensure no `.env` override breaks `NODE_ENV`. |

---

## Roadmap

**Implemented:** GitHub analysis, professional content workflow, LinkedIn publishing, job discovery/ingestion, deterministic opportunity feed, AI job matching, application tracking + timeline + interview intelligence, career intelligence dashboard, interview preparation, follow-up action center, career analytics, Gmail career email intelligence, CV builder + PDF, notifications, settings, and scheduled n8n ingestion.

**Not implemented (by design):** automatic job applications, LinkedIn/job auto-apply, outbound email on the user's behalf, scraping/browser automation, and full-auto background AI. These are intentionally excluded and would require explicit product decisions.

---

## License

MIT