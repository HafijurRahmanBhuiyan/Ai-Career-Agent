# MILESTONE 17 FINAL REPORT

## Career Opportunity Feed & Profession Matching

Task: Deliver a user-scoped Career Opportunity Feed with real, data-driven job-source ingestion and a deterministic, explainable profession match computed against the user's existing profile — without a fake job source, without scraping, without calling Claude on feed load, without a second AI matcher, and without auto-apply/auto status changes. Built on top of the completed Milestones 15 and 16.

---

### 1. Executive Summary

Milestone 17 introduces a ranked **career opportunity feed** plus a **deterministic, explainable profession match** and a **real, data-driven job-ingestion path** (`POST /api/jobs/ingest`). Every opportunity is scored deterministically from the user's persisted profile (skills, experience, preferred roles, location/remote/salary preferences, and M15 professional evidence), assigned a match level (`strong/good/partial/weak`), a plain-language **explanation**, a **recommendation** (`apply|maybe|skip`), matching/missing skills and technologies, an apply capability (`external_url | supported_api | manual_required`) with a **real handoff URL**, and whether the user has already saved/applied to it.

- **Deterministic, not AI.** The feed and detail routes reuse the existing matcher payload builders (`prepareMatchProfile` / `prepareMatchJob`) and the shared `matchLevelFromScore` thresholds and `applyCapability` classifier. **Claude is never called on feed load**, and browsing the feed **never creates a `JobMatch` record**. There is **no second matcher/model.**
- **Honest ingestion (no fake source).** `POST /api/jobs/ingest` accepts strictly-validated listings (strict Zod → unknown `userId`/`ownerId`/`accountId` → 422; only real `http(s)` URLs persisted), normalizes and deduplicates them with the existing M15 pipeline, and strips sensitive keys from `rawSource`.
- **User-scoped.** Feed and detail queries are scoped to `req.user!.id`; `alreadyApplied` is computed per authenticated user; cross-user / invalid ObjectId → 404.
- **No automation.** The feed never auto-applies, never changes status, never publishes, and runs no background workers / cron / queues.

---

### 2. Milestone Status (IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / FUTURE WORK)

- **IMPLEMENTED:** deterministic profession match, opportunity feed (`GET /api/jobs/opportunities`), opportunity detail (`GET /api/jobs/opportunities/:id`), real ingestion (`POST /api/jobs/ingest`), strict Zod validation, sensitive-key stripping, URL safety, user scoping, `alreadyApplied`, safe DTOs, Opportunities client page, 32 new tests, README + this report.
- **PARTIALLY IMPLEMENTED:** `supported_api` is implemented **as a classifier only** — it reports that a source declared an official apply API but performs **no automated submission** (by design; no such general API exists and none is faked). Live external provider connectors (e.g. Adzuna, Remotive, Greenhouse) are **not wired** — ingestion is by explicit `POST /api/jobs/ingest`, not by a scheduled poller.
- **NOT IMPLEMENTED:** no fake job source/API, no scraping, no browser automation, no auto-Claude on feed load, no second AI matcher, no auto-apply, no auto status changes, no background workers / cron / queues / notifications for the feed or ingest.
- **FUTURE WORK:** first-party provider connectors implementing `JobSource`, scheduled/delta ingestion, salary normalization/currency conversion, geocoded location matching, and richer profile-driven filtering (see §30).

---

### 3. Deterministic Matching Engine (no second AI)

`server/src/services/deterministicMatch.ts` exposes **pure** `computeDeterministicMatch(profile, job)`. It consumes the exact same typed payloads as the existing M15 matcher — `JobMatchProfilePayload` and `JobMatchJobPayload` — built by the shared `prepareMatchProfile` / `prepareMatchJob` adapters, and it reuses `matchLevelFromScore` and `MatchLevel` from `validators/jobMatch.ts` and `models/JobMatch.ts`. It is fully reproducible: the same profile + job always produces the same score and explanation.

- Tokenized, case-insensitive skill/technology/role overlap (filters non-alphanumeric separators).
- Role alignment from `preferredRoles` + experience `position`s plus M15 professional-evidence `roleRelevantKeywords` and GitHub-analysis `keyFeatures`.
- Salary expectation check against the job's posted salary range.
- Returns `recommendation: "apply" | "maybe" | "skip"` and a human-readable `explanation[]`.

---

### 4. Match Score, Weights & Level Thresholds

The score is a weighted sum of seven deterministic segments (each normalized `earned/possible`), capped at 100 and rounded:

| Segment | Weight |
|---------|--------|
| skills | 0.32 |
| technologies | 0.18 |
| role | 0.20 |
| remote | 0.10 |
| location | 0.08 |
| employment | 0.06 |
| experience | 0.06 |

- The final `matchLevel` is derived with the **shared** `matchLevelFromScore` threshold logic from `validators/jobMatch.ts` (not a new copy).
- When a job lacks `locations`/`remoteType`/`employmentType`/`experienceLevel`, those segments simply contribute no partial credit (possible stays 1) — the score never throws and never over-counts missing data.
- `recommendation`: `apply` when `score >= 75` or the applied-skill ratio `>= 0.5`; `skip` when `score < 50`; otherwise `maybe`.

---

### 5. Recommendations & Explanations

Each opportunity includes a `match` object with `score`, `matchLevel`, `matchingSkills`, `missingSkills`, `matchingTechnologies`, `missingTechnologies`, `experienceMatch`, `experienceGap`, `locationMatch`, `remoteMatch`, `employmentTypeMatch`, `salaryMatch`, `recommendation`, `recommendationReason`, and `explanation[]`.

- The `explanation[]` is assembled from plain-language, deterministic statements (e.g. how many of the listed skills match, which skills to strengthen, technology overlap, role alignment). No metric, skill, or qualification is ever invented — everything is derived from persisted profile/job data.
- `recommendationReason` summarizes the score, the match level, and a human-readable guidance line.

---

### 6. Opportunity Feed Service (filters, sort, pagination)

`server/src/services/opportunityFeed.ts` → `getOpportunityFeed(userId, filters)`:

- Base filter: `isActive: true`. Optional filters: `keywords` (regex-escaped, matched against `title`/`companyName`/`description`/`skills`, case-insensitive), `remote` (skipped when `"any"`), `employmentType`, `experienceLevel`, `source`.
- `keywords` and `source` are regex-escaped via the existing `escapeRegex` helper before use in MongoDB → no regex/NoSQL injection.
- Ranking: **deterministic score desc → freshness desc** (`postedAt || discoveredAt`) **→ `_id`** tie-breaker. Stable and reproducible.
- Pagination: `page` (default 1), `limit` (default 20, max 100). Returns `pagination { page, limit, total, totalPages }`.
- `profileComplete { hasSkills, hasExperience, hasProfile }` is derived from the existing `prepareMatchProfile` completeness signal so the client can surface a "complete your profile" state.
- Returns `OpportunityItem[]` with safe-job, safe-match, `applyCapability`, and `alreadyApplied` (user-scoped).

---

### 7. Opportunity Detail Service

`server/src/services/opportunityFeed.ts` → `getOpportunityDetail(userId, jobId)`:

- Invalid ObjectId → **404**; job not found or `isActive: false` → **404** (never leaks inactive jobs).
- Computes one deterministic match + apply capability for the job, and the authenticated user's `alreadyApplied` (scoped to `userId`). No Claude, no `JobMatch` persistence.

---

### 8. Real Data-Driven Job Ingestion (no fake source)

`server/src/services/jobIngestion.ts` → `ingestJobs(input)` implements the honest ingestion path:

- Input is a strictly-validated `{ jobs: [...] }` array (max 100). Each job's real URL fields (`jobUrl`, `applyUrl`, `companyLogo`) are passed through the existing `isValidUrl` check — only genuine `http(s)` URLs are persisted; anything else is nulled.
- `source` + `sourceJobId` are the identity; `rawData.sourceJobId` is preserved for traceability.
- **No fabricated source and no scraping:** the endpoint consumes data supplied to it; nothing is scraped, browser-automated, or invented.

---

### 9. Normalization, Deduplication & Atomic Persistence

- Each listing is normalized with the **existing** `normalizeJob` (cleaning, enum coercion, URL safety, description cap) and deduplicated with the **existing** `deduplicateJobs` (primary identity `source + sourceJobId`, plus SHA-256 fingerprint for within-run collapse).
- Persistence uses `Job.bulkWrite(..., { ordered: false })` with `upsert: true`, keyed on `{ source, sourceJobId }` — `$set` for mutable fields (title, description, URLs, skills, technologies, salary, `applyCapability`, `lastSeenAt`, `isActive: true`) and `$setOnInsert` for `source`, `sourceJobId`, `discoveredAt`, and `fingerprint`.
- Returns `{ inserted, updated, skippedDuplicates, totalJobs }`.

---

### 10. Sensitive-Key Stripping & URL Safety

- `stripSensitiveKeys` recursively removes keys whose names contain any of: `token`, `accessToken`, `access_token`, `refreshToken`, `refresh_token`, `apiKey`, `api_key`, `secret`, `password`, `authorization`, `clientSecret`, `client_secret` — applied to both `rawData` and the persisted `rawSource`. No OAuth tokens, API keys, or secrets can be stored or echoed.
- URL safety is enforced via `isValidUrl` for `jobUrl`, `applyUrl`, and `companyLogo`; description length is capped by `normalizeJob`. No non-`http(s)` schemes are persisted.

---

### 11. Apply Capability Classification (reused)

- The existing M16 `classifyApplyCapability` is reused unchanged: `external_url` (a real `http(s)` apply/job URL exists), `supported_api` (**only** when a source explicitly declares `applyApi === "supported_api"`), or `manual_required`. It never invents a URL and never classifies a LinkedIn job as automated just because it is LinkedIn.
- The capability (`capability`, `handoffUrl`, `label`) is surfaced per opportunity and persisted at ingest time on each `Job` (so it is available offline and searchable).

---

### 12. Validation Contract (Strict Zod)

`server/src/validators/opportunity.ts`:

- `opportunityQuerySchema` — **`.strict()`**: `keywords` (≤200), `remote`/`employmentType`/`experienceLevel` (valid enums from `validators/job`), `source` (≤100), `page` (int 1–10000), `limit` (int 1–100). **Any unknown query field → 422.**
- `jobIngestSchema` — **`.strict()`** `{ jobs: [...] }`, 1–100 jobs; each `ingestJobSchema` is **`.strict()`** with bounded fields (`title` 1–300, `companyName` 1–300, `description` 1–10000, `source` 1–100, `sourceJobId` 1–500, `locations` ≤20, `skills`/`technologies` ≤200, URL-only for URL fields, integer salary bounds). **Any unknown body field (e.g. `userId`, `ownerId`, `accountId`) → 422.**
- `MAX_OPPORTUNITY_LIMIT = 100`, `DEFAULT_OPPORTUNITY_LIMIT = 20`.

---

### 13. Controllers & Routes (ordering & mounting)

`server/src/controllers/opportunity.controller.ts`:

- `getOpportunities` — validates query via `safeParse`; on failure returns **422** with field-level `details`; otherwise `getOpportunityFeed(req.user!.id, ...)`.
- `getOpportunity` — `getOpportunityDetail(req.user!.id, req.params.id)`.
- `ingestJobsHandler` — validates body via `safeParse`; **422** on failure or empty array.

`server/src/routes/jobs.ts` (all JWT-authenticated via `router.use(authenticate)`):

- `POST /ingest` — `ingestLimiter` (40 / 15 min per user).
- `GET /opportunities`, `GET /opportunities/:id` — **registered BEFORE** `/api/jobs/:id/match` and `/api/jobs/:id` so the literal `opportunities` path is not swallowed by the job-detail catch-all.

---

### 14. Security & Ownership (IDOR Hardening)

- JWT required on all new routes; identity is always `req.user!.id` — **no userId is ever taken from the client** (query/params/body).
- All job reads are filtered by `{ isActive: true }`; application lookups scoped `{ user: <userId>, job: { $in } }`; invalid ObjectId → 404.
- Safe DTOs: `toSafeJob` strips `rawSource` and `__v`; `toSafeMatch` returns only the whitelisted match fields. No OAuth tokens, raw provider metadata, or `__v` leak.
- Strict Zod `.strict()` → unknown fields → 422 (defense in depth against IDOR-style tampering such as injecting `userId`/`ownerId`).
- Rate-limited ingestion prevents abuse; keywords/source regex-escaped; no scraping/browser automation.

---

### 15. Claude Boundaries (no AI on load; no JobMatch created)

- **Claude is never called on feed or detail load.** The entire feed, sort, and explanation are deterministic.
- Browsing the feed **does not create, update, or delete any `JobMatch` record** — verified by tests.
- The existing cached Claude `POST /api/jobs/:id/match` endpoint remains available for **on-demand** deep analysis (a prior, explicit user action), untouched and independent of the feed.
- No background workers, cron, queues, or notifications anywhere in M17.

---

### 16. Connect to Existing Application Flow

- `POST /api/applications` (pre-existing, M8) saves an opportunity as an application at status `saved`; the M16 review → handoff → explicit-confirmation → `applied` flow then applies unchanged.
- The feed surfaces `alreadyApplied` per user so the client can offer "Track / Save" (when not applied) vs. "Open application / View" (when already applied).
- The feed itself **never auto-applies** and **never changes status**.

---

### 17. Client — Opportunities Page

`client/src/pages/Opportunities.tsx` (route `/dashboard/opportunities`, nav item **Opportunities** between **Jobs** and **My Applications**):

- Filterable, score-ranked feed cards with match-level badges, plain-language explanation, matching/missing skill chips, apply capability, and a real-handoff "Open" button.
- "Track / Save" creates a `saved` application; already-applied opportunities show applied state (no re-save).
- Pagination, an incomplete-profile / empty state prompting the user to complete their profile, loading/error states.
- Uses existing Tailwind conventions; **no new dependencies**.

---

### 18. Task Flow Implemented

```
INGEST       POST /api/jobs/ingest → strict Zod → normalizeJob → deduplicateJobs → Job.bulkWrite(upsert)
             (rawSource/rawData sensitive keys stripped; only real http(s) URLs; applyCapability persisted)
FEED         GET /api/jobs/opportunities → isActive jobs → user-scoped filters →
             deterministic match (no Claude) → sort score desc / freshness desc / _id →
             page slice → safe DTOs + alreadyApplied (per authenticated user)
DETAIL       GET /api/jobs/opportunities/:id → deterministic match + capability + alreadyApplied; 404 inactive/invalid
SAVE/APPLY   POST /api/applications (saved) → M16 review → handoff → explicit-confirm → applied (unchanged)
```

---

### 19. Models

- **No new models** were introduced. M17 reuses and reads the existing `Job` (including the M16-added `applyCapability` field), `Application`, and the M15 `JobMatchProfilePayload` / `JobMatchJobPayload` / `JobMatch` type surface.
- The `Job` model's `applyCapability` (`ApplyCapability` enum) is *written* at ingest time and *read* by the feed, so capability classification is persisted and searchable.

---

### 20. New / Modified Files (server, M17)

**New**
- `services/deterministicMatch.ts` — pure deterministic scorer.
- `services/opportunityFeed.ts` — `getOpportunityFeed` / `getOpportunityDetail` + safe DTOs.
- `services/jobIngestion.ts` — `ingestJobs` + `stripSensitiveKeys`.
- `validators/opportunity.ts` — `opportunityQuerySchema`, `jobIngestSchema` (both strict).
- `controllers/opportunity.controller.ts` — `getOpportunities`, `getOpportunity`, `ingestJobsHandler`.
- Tests: `tests/opportunities.test.ts` (32 tests).

**Modified**
- `routes/jobs.ts` — added `POST /ingest` (rate-limited) and `GET /opportunities` / `GET /opportunities/:id`, registered **before** `/api/jobs/:id`.

---

### 21. New / Modified Files (client, M17)

**New**
- `pages/Opportunities.tsx` — the Opportunities feed page.
- `types/opportunity.ts` — feed/detail/apply-capability/pagination/profile-completion types.

**Modified**
- `App.tsx` — added `/dashboard/opportunities` route.
- `components/DashboardLayout.tsx` — added the **Opportunities** nav item (between **Jobs** and **My Applications**).

---

### 22. Use Cases Covered by Tests

`server/tests/opportunities.test.ts` (32 tests):

- **Deterministic matcher (unit):** score compute, weights, `matchLevelFromScore` reuse, recommendation `apply|maybe|skip`, explanation strings, matching/missing skills and technologies, salary/role/location/remote segments, deterministic reproducibility.
- **Feed:** auth required; empty feed with `profileComplete`; ranking (score desc → freshness desc → `_id`); keyword/remote/employmentType/experienceLevel/source filters; pagination (default 20, max 100, bounds); 422 on unknown query fields.
- **No-Claude-on-load / no `JobMatch` created:** browsing the feed and detail does not create any `JobMatch` record.
- **User scope:** `alreadyApplied` reflects only the authenticated user's application; cross-user isolation.
- **Detail:** 200 for an active owned-visible job; 404 for invalid ObjectId and inactive/missing job.
- **Ingestion:** inserts + upserts (updated), deduplication (skipped duplicates), `source+sourceJobId` identity, strict-schema 422 on unknown top-level and nested fields (`userId`/`ownerId`), URL validation (`isValidUrl` only real http(s)), and **sensitive-key stripping** (tokens/secrets removed from `rawData`/`rawSource` before persistence).

---

### 23. Test Results (server)

- **Full suite: `28` test suites passed, `552` tests passed, `0` failed** (Time ~223 s).
- Command: `cd server && GITHUB_TOKEN_ENCRYPTION_KEY=... GMAIL_TOKEN_ENCRYPTION_KEY=... ANTHROPIC_API_KEY=... npm test` (runs `jest --forceExit --detectOpenHandles`).
- Baseline M16 = 27 suites / 520 tests; M17 adds one new suite `opportunities.test.ts` with **32 tests** → 28 suites / **552 tests**. No regressions; all M16/M15 tests preserved.

---

### 24. Typecheck Results

- **Server:** `cd server && npx tsc --noEmit` → **passes** (exit 0, no errors).
- **Client:** `cd client && npx tsc --noEmit` → **passes** (exit 0, no errors).

---

### 25. Frontend Build Results

- `cd client && npm run build` (`tsc -b && vite build`) → **success**, `vite v6.4.3`, **119 modules transformed**, `dist/` built with `dist/assets/index-CowacCHT.js` (428.60 kB / gzip 114.12 kB) and `dist/assets/index-B3PAm2uJ.css` (26.64 kB / gzip 5.34 kB), built in ~1.33 s. No new dependencies; existing Tailwind conventions only.

---

### 26. Git Diff / Repo State Verification

- HEAD: `02ac0f0` ("feat: add LinkedIn publishing and application execution") — M16 committed; **M17 is NOT committed or pushed** (objective).
- `git diff --check`: **exit 0 — clean** (no whitespace/conflict markers).
- `git status --short` shows only M17-modified + untracked files (README, `client/src/App.tsx`, `client/src/components/DashboardLayout.tsx`, `server/src/routes/jobs.ts` modified; 8 new files: `Opportunities.tsx`, `types/opportunity.ts`, `opportunity.controller.ts`, `deterministicMatch.ts`, `jobIngestion.ts`, `opportunityFeed.ts`, `validators/opportunity.ts`, `tests/opportunities.test.ts`).
- **No commits created, no pushes performed.**

---

### 27. Secret / Debug / Hygiene Scan

- **No** `console.log` / `console.debug` / `debugger` in any M17 source file (all 9 new/modified M17 files scanned).
- **No** `TODO` / `FIXME` / `XXX` / `HACK` markers in M17 source.
- **No** `Claude` / `anthropic` references in any M17 server source file (`deterministicMatch.ts`, `opportunityFeed.ts`, `jobIngestion.ts`, `validators/opportunity.ts`, `opportunity.controller.ts`, `routes/jobs.ts`) — confirming no second-AI matcher and no auto-Claude on load.
- **No** hardcoded API keys, passwords, bearer tokens, or secrets in M17 source; sensitive keys are actively stripped at ingest (`stripSensitiveKeys`).
- `git diff --check` clean (exit 0).

---

### 28. Environment Variables / Config Changes

- **No new environment variables** and **no config changes** were introduced in M17.
- No `.env` or `.env.example` files were modified; no secrets/tokens are accepted from or exposed to the client.

---

### 29. Features Omitted / Out of Scope (By Design) & Limitations

**Omitted / out of scope (by design):**
- No scraping, no browser automation (no Puppeteer/Playwright).
- No fake job source / fabricated API results; ingestion is explicit and data-driven.
- No auto-Claude on feed load and no second AI matcher (deterministic scoring only on the feed).
- No auto-apply, no auto status changes, no background workers/cron/queues/notifications.
- `supported_api` reports capability only — **no automated submission** (no such general API exists).

**Limitations:**
- The feed ranks jobs that exist in the local `Job` store; real external providers are not yet connected (ingestion is manual/explicit `POST /api/jobs/ingest` for now).
- Matching is a heuristic: location is a string-substring/preference check (no geocoding), and salary is a single `min <= expectation.max` comparison (no currency normalization).
- `supported_api` is intentionally conservative — it activates only when a source explicitly declares `applyApi === "supported_api"`; wiring an actual first-party submit path is future work.
- Feed quality depends on profile completeness (skills, experience, preferred roles, location/remote preferences); low-completeness profiles yield weaker explanations (surfaced via `profileComplete`).

---

### 30. Recommended Next Milestone (#18) + Confirmation + Sign-Off + Final Verification

**Recommended next milestone (#18):**
- **First-party provider connectors** implementing `JobSource` (e.g. Greenhouse, Lever, Adzuna) plus scheduled/delta ingestion in place of explicit `POST /api/jobs/ingest`.
- **Richer matching:** geocoded location match, salary/currency normalization, and persisted per-user match caching to avoid recomputation.
- **Feed interactions:** "not interested" dismissals, saved-opportunity collections, and applying filtered views straight into the application tracker.

**Confirmation — nothing committed/pushed:** `git log --oneline -1` = `02ac0f0` (M16, prior commit), `git status --short` shows only M17 modified/untracked files, `git diff --check` clean, and no `git push` performed. **No commits created, no pushes made.**

**Sign-off checklist (M17):**
- [x] Deterministic profession matcher reusing `prepareMatchProfile` / `prepareMatchJob` + `matchLevelFromScore` + `classifyApplyCapability` (no second matcher/model, no Claude on load).
- [x] User-scoped feed (`GET /api/jobs/opportunities`) + detail (`GET .../:id`) with filters, deterministic sort, pagination, `alreadyApplied`, safe DTOs; 404 on cross-user/invalid/inactive.
- [x] Real, data-driven ingestion (`POST /api/jobs/ingest`) — normalization, deduplication, atomic upsert, strict Zod, URL safety, sensitive-key stripping, rate-limited.
- [x] Strict Zod contracts (`.strict()`) → unknown query/body fields → 422; identity always `req.user!.id`.
- [x] No fake source, no scraping, no auto-apply, no auto status changes, no background workers.
- [x] Client Opportunities page + route + nav; no new dependencies.
- [x] README updated to Milestone 17 (M1–16 preserved); this report written (30 sections).

**Final verification:**
- [x] Server full suite: **28 suites / 552 tests pass** (no regressions; M16 520 preserved).
- [x] Server `tsc --noEmit` passes; Client `tsc --noEmit` passes.
- [x] Client `npm run build` passes (119 modules, dist built).
- [x] `git diff --check` clean; secret/debug/TODO/Claude scan clean across M17 source.
- [x] `MILESTONE 17 FINAL REPORT.md` written (this document).
- [x] Nothing committed or pushed.
