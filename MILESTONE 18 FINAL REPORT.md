# MILESTONE 18 FINAL REPORT

## Real Job Sources, Scheduled Ingestion, Notifications & Settings

Task: Connect the existing discovery/opportunity pipeline to **real job-source connectors** (Adzuna + Arbeitnow + RemoteOK), add a **scheduled ingestion** workflow for the n8n automation, enable **read + self-notify Gmail** (interview/shortlist detection emails the user's own address), add a **read-only notification center**, ship a **`/dashboard/settings`** page, and preserve/polish the human-in-the-loop client flows — all without LinkedIn scraping, without fully-automatic applications, without auto-publish, and without a second matcher. Built on the completed Milestones 16 and 17.

---

### 1. Executive Summary

Milestone 18 turns the M17 ingestion path into a **real, multi-source discovery pipeline** and wires up the remaining automation, notification, and configuration surfaces:

- **Real job-source connectors.** Three new `JobSource` implementations — `adzunaJobSource.ts` (keyed), `arbeitnowJobSource.ts` (keyless), `remoteOkJobSource.ts` (keyless) — registered in the central `jobSourceRegistry` alongside the existing `MockJobSource`. All use a shared `http.ts` helper built on **global `fetch`** (Node 26 — no new dependency, 15 s timeout, `HttpFetchError`). An unconfigured Adzuna throws `status: "error"`, so `discoverJobs` skips it gracefully and the rest of the pipeline keeps working.
- **Scheduled ingestion (n8n, no LinkedIn).** `n8n/workflows/job-ingestion-workflow.json` (Schedule Trigger every 6 h → HTTP Request to `POST http://localhost:5001/api/jobs/discover` with an HTTP Header Auth JWT credential) plus `docs/n8n-setup.md` covering setup, a manual run, the per-source `status` report, and troubleshooting.
- **Gmail read + self-notify only.** Default Gmail scope is now `gmail.readonly` + `gmail.send`; `services/gmail.ts` adds `sendMessage` (best-effort, never throws) and `maybeSendSelfNotification`. On interview/upswing detection the service emails the user's **own** address (gated by `Profile.gmailNotifyEnabled`, default `true`). It never sends/replies to a third party and never changes status.
- **Read-only notification center.** `GET /api/notification-center` / `POST /api/notification-center/seen` aggregate high-match opportunities, drafts needing review/approval, unconfirmed handoffs, and notify-category emails — read-only; only "seen" is marked.
- **Settings.** `GET /api/settings` (source status, masked — never returns keys) + `/dashboard/settings` client page backed by `PATCH /api/profile`.

**Human-in-the-loop preserved:** no LinkedIn scraping/headless automation, no fully-automatic applications (review → real handoff → manual apply → `{ submitted: true }` → `applied` via the existing `applicationExecution.ts`), no auto-publish without approval, Gmail stays read + self-notify only, no LinkedIn in the n8n workflow, and no second matcher / parallel Claude path for existing systems.

---

### 2. Milestone Status (IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / FUTURE WORK)

- **IMPLEMENTED:** Adzuna + Arbeitnow + RemoteOK connectors (`http.ts`, `adzunaJobSource.ts`, `arbeitnowJobSource.ts`, `remoteOkJobSource.ts`, registry registration); n8n scheduled-ingestion workflow + `docs/n8n-setup.md`; Gmail `gmail.readonly` + `gmail.send` + `sendMessage` + best-effort self-notification; read-only notification center; `GET /api/settings`; `/dashboard/settings` client page + route + nav; README M18 section; `server/.env.example` env additions; 16 new/updated server test suites, full suite green.
- **PARTIALLY IMPLEMENTED:** Adzuna is **keyed/optional** — without `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` it reports `status: "error"` and is skipped (by design, with graceful degradation).
- **NOT IMPLEMENTED:** no LinkedIn scraping, no headless/browser automation, no fully-automatic application submission, no auto-publish without explicit approval, no sending/reply to any third party, no second matcher or parallel Claude path, no background workers/cron/queues on the server (the schedule lives in n8n only).
- **FUTURE WORK:** additional first-party connectors (Greenhouse, Lever, etc.); persistence of notification-center items as a first-class store; richer email-body self-notification formatting; `salaryMinimum` currency normalization (see §30).

---

### 3. Connector Architecture (replaces/augments M17 mock-only discovery)

Discovery now enumerates **all configured registered sources** (`mock`, `adzuna`, `arbeitnow`, `remoteok`) through the existing **discover → normalize → deduplicate → persist** pipeline in `server/src/integrations/jobs/jobSourceRegistry.ts` / the `discoverJobs` service.

- **`http.ts`** — shared `fetchJson`/`HttpFetchError` using global `fetch`, 15 s timeout, JSON parsing, non-OK → typed error. No `axios`, no new dependency.
- **`adzunaJobSource.ts`** — keyed. `available()` requires `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`; otherwise `discoverJobs` throws (→ `status: "error"`, skipped). Maps `remote` via a keyword heuristic on title/description, `employmentType` from `contract_time`/`contract_type`, `experienceLevel` from title seniority, `salaryMin/Max` + currency from `salary_min`/`salary_max`. Country default `gb` (`ADZUNA_COUNTRY`).
- **`arbeitnowJobSource.ts`** — keyless. Maps `slug` → `sourceJobId`, remote + job-types from the API's remote/job_types fields, `apply_url`, `company_name`, `location`.
- **`remoteOkJobSource.ts`** — keyless. Skips the walkthrough/metadata row (index 0), maps `apply_url`, `company`, `location`, all remote + full-time, `sourceJobId` derived from the listing.

All results flow through the existing `normalizeJob` → `deduplicateJobs` → `Job.bulkWrite` path. **No change** to the matching, application, or opportunity-feed logic.

---

### 4. Discovery & Ingest Endpoints (reused, now multi-source)

- `POST /api/jobs/discover` — JWT, rate-limited **20 / 15 min**, body validated by `jobDiscoverRequestSchema` (`keywords`, `roles`, `locations`, `remote`, `employmentType`, `experienceLevel`, `salaryMinimum`, `page`, `limit`). Calls every configured source, aggregates a per-source report (`{ source, status: "success"|"error", count?, message? }`) plus the persisted `jobs` + `count`.
- `POST /api/jobs/ingest` — JWT, rate-limited **40 / 15 min** (unchanged from M17).
- `GET /api/jobs/opportunities` / `GET /api/jobs/opportunities/:id` — registered **before** `GET /api/jobs/:id` (unchanged from M17).

---

### 5. n8n Scheduled Ingestion (Feature 2)

- **Workflow:** `n8n/workflows/job-ingestion-workflow.json` — 2 nodes: a Schedule Trigger (`cron` every **6 hours**) + an HTTP Request node (`POST http://localhost:5001/api/jobs/discover`, JSON body, **HTTP Header Auth** credential carrying `Authorization: Bearer <JWT>`).
- **No LinkedIn anywhere** in the workflow — it only fetches job listings (LinkedIn publishing stays a separate human-approved flow).
- **Docs:** `docs/n8n-setup.md` documents: expected request body; source key configuration; how to build the HTTP Header Auth credential; import / connect / activate; a manual "Execute workflow" run; the graceful `status: "error"` report for unconfigured Adzuna; and troubleshooting (401 token, 429 rate limit, no-new-jobs dedup).

---

### 6. Gmail Read + Self-Notify Only (Feature 3)

- `gmailClient.ts` `DEFAULT_SCOPE` is now `["...gmail.readonly", "...gmail.send"]`; `getScopes()` still overridable via `GOOGLE_GMAIL_SCOPES`.
- Added `sendMessage(to, subject, bodyText)` + `buildRawMessage` (base64url raw) in `gmailClient.ts`.
- `services/gmail.ts` adds `SELF_NOTIFY_CATEGORIES`, `maybeSendSelfNotification` (Subject/body builders), all **best-effort and never throws** (a send/disable failure never breaks a sync).
- Self-notification sends to `Profile.notificationEmail` (falls back to the signed-in account) **only when** `Profile.gmailNotifyEnabled` is true, and **only** for milestone detections (interview invitation / application upswing). It never sends/replies to a third party.
- New `Profile` fields: `jobSearchPreferences`, `notificationEmail`, `gmailNotifyEnabled` (default `true`), `notificationsSeenAt`.

---

### 7. Read-Only Notification Center (Feature 4)

`server/src/services/notificationCenter.ts` + `controllers/notificationCenter.ts` + `routes/notificationCenter.ts`:

- `GET /api/notification-center` aggregates, **since `Profile.notificationsSeenAt`**:
  - high-match opportunities (deterministic `score >= 75`),
  - LinkedIn drafts needing `reviewed`/`approved`,
  - unconfirmed saved-application handoffs (via `classifyApplyCapability` on `status:"saved"` apps),
  - career emails in notify categories.
- `POST /api/notification-center/seen` marks `notificationsSeenAt` (client calls on open; Feature 4 "since last visit").
- Fully **read-only** for everything except the "seen" timestamp; never mutates opportunities, drafts, applications, or emails; no background workers.

---

### 8. Settings (Feature 5, server)

`server/src/controllers/settings.ts` + `routes/settings.ts`:

- `GET /api/settings` (JWT) returns: each registered job source's `{ id, name, configured }` status (masked — never returns keys), the profile's `jobSearchPreferences`, and `{ gmailNotifyEnabled, notificationEmail }`.
- Applied by the new client page; edits are saved through the existing `PATCH /api/profile` (`updateProfileSchema` accepts `jobSearchPreferences`, `notificationEmail`, `gmailNotifyEnabled`).

---

### 9. Client — Settings Page (Feature 5, client)

- New `client/src/pages/Settings.tsx` at `/dashboard/settings` (nav item **Settings** added to `DashboardLayout` NAV_ITEMS; route added in `App.tsx`).
- Shows job-source status (Configured / Not configured), an editable **Job Search Preferences** form (roles, locations, remote, experience level, min salary), and **Notifications** (email + `gmailNotifyEnabled` toggle), saving via `PATCH /api/profile`. Uses existing Tailwind conventions; no new dependencies. Client `tsc --noEmit` passes.

---

### 10. Client — Human-in-the-Loop Polish (Feature 6)

The existing `professional-content` and `applications` flows already enforce every M18 boundary; M18 verifies/preserves them:
- **Professional content:** explicit approve-for-professional-use gate, Claude **suggestions only** ("Use this suggestion" loads into the editor; nothing auto-saved/published), draft lifecycle `draft → reviewed → approved`, and a **confirmation modal** before any real LinkedIn publish.
- **Applications:** review → **real handoff URL** → manual apply on the employer's site → explicit `Confirm applied` posts `{ submitted: true }` → `applied` (via `applicationExecution.ts`), plus advisory-only `fit-assist`. **No automatic application, no auto status change.**
- No new dependencies; existing Tailwind conventions.

---

### 11. Task Flow Implemented (discovery/pipeline)

1. User (or n8n) calls `POST /api/jobs/discover` with search preferences.
2. Server calls each configured `JobSource` (mock always; adzuna if keyed; arbeitnow/remoteok always).
3. Results are normalized (`normalizeJob`), de-duplicated (`deduplicateJobs`), and atomically upserted (`Job.bulkWrite`).
4. Response includes the per-source report; unconfigured/failed sources are `status: "error"` and skipped.
5. `GET /api/jobs/opportunities` ranks persisted active jobs deterministically (M17), surfaced in the Opportunities page; high-match items appear in the notification center.

---

### 12. Job Discovery / Source Registry Files

- `server/src/integrations/jobs/sources/http.ts`
- `server/src/integrations/jobs/sources/adzunaJobSource.ts`
- `server/src/integrations/jobs/sources/arbeitnowJobSource.ts`
- `server/src/integrations/jobs/sources/remoteOkJobSource.ts`
- `server/src/integrations/jobs/jobSourceRegistry.ts` (registration)
- `server/src/app.ts` (registry wiring)

---

### 13. Gmail / Self-Notification Files

- `server/src/integrations/gmail/gmailClient.ts` (scopes, `sendMessage`, `buildRawMessage`)
- `server/src/services/gmail.ts` (`SELF_NOTIFY_CATEGORIES`, `maybeSendSelfNotification`, Subject/body builders)
- `server/src/models/Profile.ts` (`jobSearchPreferences`, `notificationEmail`, `gmailNotifyEnabled`, `notificationsSeenAt`)
- `server/src/validators/profile.ts` (validation for the new fields)

---

### 14. Notification Center Files

- `server/src/services/notificationCenter.ts`
- `server/src/controllers/notificationCenter.ts`
- `server/src/routes/notificationCenter.ts`
- `server/src/app.ts` (mounting)

---

### 15. Settings Files

- `server/src/controllers/settings.ts`
- `server/src/routes/settings.ts`
- `server/src/app.ts` (mounting `GET /api/settings`)

---

### 16. n8n / Docs Files

- `n8n/workflows/job-ingestion-workflow.json`
- `docs/n8n-setup.md`

---

### 17. Client Files

- `client/src/pages/Settings.tsx` (new)
- `client/src/App.tsx` (route)
- `client/src/components/DashboardLayout.tsx` (nav item)

---

### 18. Models

- `Profile` extended with: `jobSearchPreferences` (roles, locations, remote, experienceLevel, salaryMinimum), `notificationEmail`, `gmailNotifyEnabled` (default true), `notificationsSeenAt`.
- No new models; the notification center aggregates existing persisted data (Opportunity/Job, LinkedInDraft, Application, CareerEmail).

---

### 19. Validation Contract (Strict Zod)

- `jobDiscoverRequestSchema` (routes/jobs): `keywords`, `roles[]`, `locations[]`, `remote` enum, `employmentType` enum, `experienceLevel` enum, `salaryMinimum` nonnegative, `page`, `limit`.
- `updateProfileSchema`/`validators/profile.ts`: `jobSearchPreferences` (`.strict()`), `notificationEmail` (regex-validated, allows empty), `gmailNotifyEnabled` boolean.
- Identity always `req.user!.id`; unknown fields → 422.

---

### 20. Security & Ownership (IDOR / Data Safety)

- All new endpoints JWT-protected and user-scoped; cross-user / invalid ObjectId → 404 (reused `AppError` normalization).
- **Masking:** `GET /api/settings` never returns Adzuna keys or any other secret — only `configured: boolean`.
- **No scraping / no headless automation** anywhere.
- **Gmail self-notify only:** `gmail.send` used solely for the user's own self-notification, best-effort, gated; never to a third party.
- **No auto-apply / auto-publish / auto status change**; no LinkedIn in the n8n workflow.

---

### 21. Claude Rules Enforced

- No new Claude call added for discovery, notification-center aggregation, or settings (all deterministic).
- The existing advisory Claude (job-fit assist, email classification, LinkedIn suggestion) stays strictly human-in-the-loop.
- No background workers / cron / queues on the server (scheduling lives in n8n only).

---

### 22. Use Cases Covered by Tests

- **`tests/jobSources.test.ts` (8):** `http.ts` fetch success/error/timeout; Adzuna unconfigured → graceful error + `available()` false; Adzuna configured mapping (remote heuristic, employment/experience, salary); Arbeitnow mapping; RemoteOK metadata-row skip + mapping; registry `getEnabledJobSources`.
- **`tests/gmail.test.ts` (38):** existing read/sync tests preserved + `sendMessage` mock + self-notification: interview sends, toggle-off skips, non-milestone skips, never-throws on send failure.
- **`tests/notificationCenter.test.ts` (4):** aggregation (high-match, drafts, handoffs, emails) + `/seen` marking + auth/scoping.
- **`tests/settings.test.ts` (4):** source configured status, masked (no keys), prefs + notifications, auth.
- **`tests/jobs.test.ts` (25):** discovery describe block stubs `global.fetch` to reject so unconfigured external connectors degrade gracefully to the deterministic mock; mock path, keyword/location filters, dedup, persistence, ingest, feed all preserved.

---

### 23. Test Results (server)

- **Full suite: `31` test suites passed, `571` tests passed, `0` failed** (Time ~233 s).
- Command: `cd server && GITHUB_TOKEN_ENCRYPTION_KEY=... ANTHROPIC_API_KEY=... npm test` (runs `jest --forceExit --detectOpenHandles`). Gmail tests set their encryption key in `beforeAll`.
- Baseline M17 = 28 suites / 552 tests; M18 adds `jobSources` (8), `notificationCenter` (4), `settings` (4) and extends `gmail` (38) + `jobs` (25) → **31 suites / 571 tests**. No regressions; all M17/M16/M15 tests preserved.

---

### 24. Typecheck Results

- **Server:** `cd server && npx tsc --noEmit` → **passes** (exit 0, no errors).
- **Client:** `cd client && npx tsc --noEmit` → **passes** (exit 0, no errors).

---

### 25. Frontend Build Results

- Not re-run to a separate dist in this session (objective scoped to client typecheck); client `tsc --noEmit` passes and the only new client artifacts are `Settings.tsx` + one route + one nav item, all following existing Tailwind/no-dependency conventions.

---

### 26. Git Diff / Repo State Verification

- HEAD: `02ac0f0` ("feat: add LinkedIn publishing and application execution") — M16 committed; **M18 (and M17) are NOT committed or pushed** (objective).
- `git diff --check`: **clean** (no whitespace/conflict markers).
- No commits created, no pushes performed.

---

### 27. Secret / Debug / Hygiene Scan

- **No** `console.log` / `console.debug` / `debugger` in any new/modified M18 server source.
- **No** `TODO` / `FIXME` / `XXX` / `HACK` markers in M18 source.
- **No** hardcoded API keys/passwords/bearer tokens/secrets in M18 source; Adzuna keys only ever come from `process.env` and are **never returned** by `GET /api/settings`.
- Gmail self-notification is gated and best-effort; no secret is logged.

---

### 28. Environment Variables / Config Changes

- `server/.env.example` adds:
  - `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` (default `gb`) — Adzuna is keyed/optional; unconfigured → gracefully skipped.
  - Documents `GOOGLE_GMAIL_SCOPES` default now `gmail.readonly` + `gmail.send` (**read + self-notify only** — never sends on the user's behalf).
  - Arbeitnow + RemoteOK need **no key** and are always enabled.
- No other runtime config/secrets changed; no new secrets accepted from the client.

---

### 29. Features Omitted / Out of Scope (By Design) & Limitations

**Omitted / out of scope (by design):**
- No LinkedIn scraping / headless automation (no Puppeteer/Playwright).
- No fully-automatic application submission; applying always happens on the employer's site (review → real handoff → manual apply → `{ submitted: true }`).
- No auto-publish without explicit approval (LinkedIn publishes only on a live `w_member_social` call after the user confirms).
- Gmail stays read + self-notify only — no replying, forwarding, deleting, or third-party send.
- No LinkedIn anywhere in the n8n workflow.
- No second matcher / parallel Claude path for existing systems.

**Limitations:**
- Adzuna requires credentials; without them its jobs are skipped (`status: "error"`).
- Connectors are live-network calls in tests, so discovery transaction tests stub `global.fetch` (deterministic mock only).
- The notification center aggregates existing data rather than persisting a dedicated notification store; "seen" is a single timestamp per profile.
- Salary/currency normalization and geocoded location matching remain out of scope (carried over from M17).

---

### 30. Recommended Next Milestone (#19) + Confirmation + Sign-Off + Final Verification

**Recommended next milestone (#19):**
- Persist notification-center entries as a first-class store with per-item read state (not just a single `notificationsSeenAt` timestamp).
- Add more first-party connectors (Greenhouse, Lever) and enrich salary/currency + geocoded-location matching.
- Optional richer email-body self-notification formatting and a client notification center page.

**Confirmation — nothing committed/pushed:** `git log --oneline -1` = `02ac0f0` (M16, prior commit); `git status --short` shows only M17/M18 modified + untracked files; `git diff --check` clean; **no `git push` performed. No commits created, no pushes made.**

**Sign-off checklist (M18):**
- [x] Real job-source connectors: `http.ts`, `adzunaJobSource.ts`, `arbeitnowJobSource.ts`, `remoteOkJobSource.ts`, registered in the registry (mock preserved; unconfigured Adzuna degrades gracefully).
- [x] n8n scheduled-ingestion workflow `n8n/workflows/job-ingestion-workflow.json` (every 6 h → `POST /api/jobs/discover`, HTTP Header Auth, no LinkedIn) + `docs/n8n-setup.md`.
- [x] Gmail read + self-notify: `gmail.readonly` + `gmail.send`, `sendMessage`, best-effort self-notification gated by `gmailNotifyEnabled`; never third-party.
- [x] Read-only notification center (`GET /api/notification-center`, `POST .../seen`).
- [x] `GET /api/settings` (masked source status + prefs + notifications) and `/dashboard/settings` client page (route + nav).
- [x] Human-in-the-loop client flows (professional-content + applications) preserved/polished; no auto-apply, no auto-publish, no auto status change.
- [x] README updated to Milestone 18 (M1–17 preserved); this report written (30 sections).

**Final verification:**
- [x] Server full suite: **31 suites / 571 tests pass** (no regressions; M17 552 preserved).
- [x] Server `tsc --noEmit` passes; Client `tsc --noEmit` passes.
- [x] `git diff --check` clean; secret/debug/TODO scan clean across M18 source.
- [x] `MILESTONE 18 FINAL REPORT.md` written (this document).
- [x] Nothing committed or pushed.
