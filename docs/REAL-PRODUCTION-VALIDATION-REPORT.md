# Real Production E2E Validation Report

**Date:** 2026-09-02
**Repository:** Ai-Career-Agent (MERN + Claude AI + n8n)
**Scope:** Real external-provider validation with a live local production build against the real connections. No fake/mock data was used to claim production success.

---

# Executive Summary

**Overall result: `PRODUCTION READY WITH LIMITATIONS`**

This report distinguishes **CODE VERIFIED** (correct by inspection/automated tests only) from **REAL E2E VERIFIED** (actually exercised against the live provider/API). The job-discovery pipeline and apply-handoff were **REAL E2E VERIFIED** against the live Arbeitnow and RemoteOK public APIs. Gmail OAuth/sync, career-status detection/career-events, notifications, Adzuna, and n8n runtime each remain **CODE VERIFIED / BLOCKED BY EXTERNAL CONFIGURATION** because the required external credentials or runtime were not present, and per the rules nothing was fabricated to claim otherwise.

**Four real defects were found and fixed** during validation (Arbeitnow epoch-seconds dates, Arbeitnow double-pagination, Adzuna USD currency label, RemoteOK 0/0 salary), all in the job-source adapter layer. 4 new regression tests were added; the full suite rose from 930 to **934 tests, all green**. No unrelated architecture was changed.

---

## 1. Baseline Tests

| Area | Result | Evidence |
| ------------ | --------- | ------------ |
| Server tests | PASS | 48 suites / 934 tests passed |
| Client tests | N/A | No client test runner exists (typecheck + build used) |
| Typecheck | PASS | server `tsc --noEmit` clean; client `tsc --noEmit` clean |
| Build | PASS | client `vite build` passed (477.75 kB JS / 28.25 kB CSS, gzip 125.8 kB) |
| npm audit | PASS | server + client: **0 vulnerabilities** (all audit levels) |
| n8n workflow JSON | PASS | Valid JSON; 4 nodes; `onError: continueErrorOutput` on discovery + stale nodes |

---

## 2. Real Job Providers

| Provider | Configured | Real API Tested | Jobs Retrieved | Result |
| --------- | ---------- | --------------- | -------------: | ---------------- |
| Adzuna | **NOT configured** (no `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`) | No | 0 | BLOCKED — credentials missing (gracefully skipped; does not break other sources) |
| Arbeitnow | Yes (keyless) | **YES — live API** | 1 (filtered query) | **REAL E2E VERIFIED** |
| RemoteOK | Yes (keyless) | **YES — live API** | 3 (filtered query) | **REAL E2E VERIFIED** |
| Mock | Development-only (`NODE_ENV=development`) | — | 0 for real query | DEVELOPMENT ONLY — excluded from all success claims |

Real discovery was run through the application's own pipeline (`POST /api/jobs/discover`) against the real APIs. Two sequential runs retrieved 4 real jobs and persisted them via the real `normalizeJob → deduplicateJobs → bulkWrite(upsert)` path. Adzuna correctly reported `status:"error"` (not configured) without breaking the other sources.

---

## 3. Real Job Verification

Real listings were fetched (HTTP 200, redirects followed) and cross-checked against stored data. Identity was confirmed against the live page content, not merely by URL syntax.

| Provider | Job title | Company | Location | Source URL | Apply URL | URL reachable | Job identity verified | Details verified | Result |
| -------- | --------- | ------- | -------- | ---------- | --------- | ------------- | --------------------- | ---------------- | ------ |
| Arbeitnow | Fullstack Software Engineer - Core | Dataiku | Remote | `https://www.arbeitnow.com/jobs/companies/dataiku/remote-fullstack-software-engineer-core-437469` | same | YES (200) | YES (title + company in page) | YES (salary unknown, employment full-time) | **PASS** |
| RemoteOK | Construction Estimator | Streamline Search | Corby | `https://remoteok.com/remote-jobs/remote-construction-estimator-streamline-search-1137238` | same | YES (200) | YES (title + company in page) | YES | **PASS** |

Both are **CONTENT VERIFIED / JOB IDENTITY VERIFIED** — not just valid-syntax. `remoteType`, `employmentType`, `location` matched the live listing content for the sampled jobs.

---

## 4. Matching Verification

**BLOCKED — real profile/resume unavailable.** The local database contained **0 profiles** and **0 resumes** (inspection confirmed). Per the no-fabrication rule, a fictional profile was not created to force a match score. The deterministic matcher, salary-overlap logic (`jobSalaryMatch.ts`), and score threshold assembly are **CODE VERIFIED** by the existing 930-test suite (`jobMatch*.test.ts`, `jobSalaryMatch.test.ts`, `opportunities.test.ts`). No claim is made that real matching was proven against real jobs with a real profile.

---

## 5. Gmail

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` are all empty ⇒ Gmail is **not configured**.

```text
OAuth:                              BLOCKED — configuration missing (client id/secret/redirect unset)
Sync:                               BLOCKED — configuration missing
Career detection:                   CODE VERIFIED (no real OAuth; logic covered by tests)
Career event extraction:            CODE VERIFIED (no real OAuth; timezone never guessed, tested)
Application matching:               CODE VERIFIED (no real OAuth)
Notification:                       CODE VERIFIED (self-recipient guard + failure-isolation tested)
```

Key code-level confirmations:
- Default scopes are `gmail.readonly` + `gmail.send` (send used **only** for self-notification to the user's own `notificationEmail`/account — `gmail.ts:536-537`, guarded by `gmailNotifyEnabled`, best-effort, never to third parties).
- Detection only advances status forward with high-confidence + explicitly allowed transition; never sets `applied` or `withdrawn` (`gmail.ts:368-383`).
- Syncing never changes `Application.status`; career events are idempotent per Gmail message id.

---

## 6. Dashboard

**CODE VERIFIED only.** Dashboard aggregates (`/api/dashboard/career-intelligence`, analytics, feeds) recompute deterministically from persisted data; with no real profile/Gmail/applications in the DB the UI shows empty states. The data source is real persisted records — verified by the Gmail career-status, analytics, and career-intelligence test suites (113 tests across the Gmail/career suites passed). No UI value was fabricated.

---

## 7. n8n

```text
Workflow JSON:  PASS   (valid; nodes: schedule [fast-forward every 6h] → discovery → stale → gmail sync)
Credentials:    PASS   (httpHeaderAuth generic credential type; NO secrets in the JSON)
Real execution: BLOCKED (no n8n runtime configured locally/remotely to trigger a run)
Error isolation:PASS   (discovery + stale nodes have node-level onError:continueErrorOutput; stale main+error outputs both feed gmail sync)
```

`discovery/run` and `maintenance/stale` required ADMIN; a plain user was confirmed **403**, and the endpoints executed correctly as admin (returning aggregate-only counts; the run found 0 eligible users because 0 real profiles exist). `gmail/sync-all` (admin-only) returned cleanly with 0 users. Because there is no n8n runtime in this environment, a full scheduled run was **not** executed — no PASS is claimed.

---

## 8. LinkedIn

```text
Implemented:     LinkedIn OAuth + LinkedIn Posts publishing (w_member_social)
Not implemented: LinkedIn Jobs search
Blocked by approved API access: YES — Linkedin Jobs search requires separate Jobs API/partner approval
```

Scope is `openid profile email w_member_social` (publishing only). There is **no LinkedIn job search, scraping, or browser automation** in the codebase. The n8n workflow contains no LinkedIn. **LinkedIn job discovery is NOT supported and is not claimed.**

---

## 9. Security

| Severity | Finding |
| -------- | ------- |
| P0 | None. |
| P1 | None. |
| P2 | `none` — No secrets tracked by Git; `.env`/`.env.bak`/`.env.production` are gitignored; only `.env.example` files committed (verified via `git ls-files` + `git check-ignore`). `npm audit` clean. |
| P3 | OAuth state is in-memory (non-persistent across restart); acceptable single-instance, noted. |

Verified specifics (code inspection + live behavior): CORS restricted to `CLIENT_URL`; Helmet enabled; multer limited to `MAX_RESUME_FILE_BYTES` with extension allow-list; OAuth state cryptographically random + one-time + bound to user (tests pass); handoff URL validation accepts only `http/https` with a real hostname (mirrored client+server); Gmail raw bodies not logged; apply never auto-submits; admin endpoints enforce role.

---

## 10. Defects Found

| Severity | File | Function | Problem | Evidence | Fix | Regression test |
| -------- | ---- | -------- | ------- | -------- | --- | --------------- |
| P1 | `server/src/integrations/jobs/sources/arbeitnowJobSource.ts` | `searchJobs` / date mapping | `created_at` is epoch **seconds**; fed as ms → stored `postedAt` of **1970-01-21** (fabricated, wrong date) | Real API shows `created_at:1788328510`; stored job showed `1970-01-21T16:45:28Z` | Added `toPostedAt()` converting epoch-seconds → ISO; unparsable → null | `converts epoch-second created_at to a real postedAt date (not 1970)` |
| P1 | `server/src/integrations/jobs/sources/arbeitnowJobSource.ts` | `searchJobs` pagination | Double-pagination: `?page=N` is applied then sliced again → page-2 window starts at offset 20 of an already-paginated page, permanently skipping records | Real API returns **identical ~175-item** list per `page`; adapter page-2 slice skipped `sr-manager-ai-forward-deployed-engineering-...` | Always fetch the newest snapshot and slice contiguous `[(page-1)*limit, page*limit)` | `paginates contiguously across local windows without double-pagination` |
| P2 | `server/src/integrations/jobs/sources/adzunaJobSource.ts` | `searchJobs` | `salaryCurrency` hardcoded `"USD"` for every country | Code review (Adzuna returns local currency per country, e.g. GBP for `gb`) | Added `currencyForCountry()` mapping for known Adzuna countries; unknown → USD | `derives salary currency from the configured country, never hardcoding USD` |
| P2 | `server/src/integrations/jobs/sources/remoteOkJobSource.ts` | `searchJobs` | `salary_min:0`/`salary_max:0` stored as a real "$0" range → matcher reports a false salary mismatch | Real API returns `0/0` for many roles with no salary | Added `toSalaryOrNull()` — stores null when bound is ≤0 | `maps a 0/0 salary (unspecified) to null instead of a misleading $0 range` |

All four are adapter-layer only; matching, models, application, Gmail, and n8n architecture were left untouched. **No code defect found in the matching, application, OAuth, or Gmail logic.**

---

## 11. External Dependencies (user must configure for full real-E2E)

- **Adzuna** — `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (and confirm `ADZUNA_COUNTRY`; now currency-aware).
- **Gmail OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, plus the Google redirect URL must be registered in the Google Cloud Console.
- **n8n** — the n8n runtime/instance, the `httpHeaderAuth` credential (a server `JOB_API_KEY`/admin JWT), and the callback `base URL` (currently `http://localhost:5001`) must be set to the deployed server URL.
- **MongoDB** — running (local in this validation; production Atlas or dedicated instance).
- **AI providers** — `ANTHROPIC_API_KEY` (+ `GEMINI_API_KEY`/`OPENAI_API_KEY` fallbacks), models.
- **A real user profile + resume** — required to exercise deterministic/AI matching with real data (absent in this validation DB).
- **LinkedIn partner access** — for publishing, the app + `w_member_social`; for **job search**, a separate LinkedIn Jobs API/partner approval that is **not** present.

---

## 12. Final Acceptance Matrix

| Requirement | Result |
| ----------- | ------ |
| Find real jobs | **PASS (REAL E2E)** — Arbeitnow + RemoteOK live |
| Show real job details | **PASS (REAL E2E)** |
| Verify job existence | **PASS (REAL E2E)** — live pages reachable |
| Verify original job URL | **PASS (REAL E2E)** — http/https, reachable |
| Verify application URL | **PASS (REAL E2E)** — http/https, reachable, not javascript/data/file/localhost |
| Correct requirement extraction | **CODE VERIFIED** (no real profile run) |
| Correct match score | **BLOCKED** — no real profile/resume |
| Real Gmail connection | **BLOCKED** — OAuth not configured |
| Detect interview | **BLOCKED** — Gmail not configured (logic CODE VERIFIED) |
| Detect shortlist/screening | **BLOCKED** — Gmail not configured (logic CODE VERIFIED) |
| Detect offer | **BLOCKED** — Gmail not configured (logic CODE VERIFIED) |
| Update dashboard | **CODE VERIFIED** — deterministic from real persisted data |
| Send self-notification | **BLOCKED** — Gmail OAuth not configured (self-recipient logic CODE VERIFIED) |
| n8n automation | **BLOCKED** — no n8n runtime; endpoints verified (403/200) |
| No auto-apply | **PASS** — apply stays `saved`; real handoff URL; no `{submitted:true}` until explicit user confirmation |
| Security | **PASS** — no tracked secrets, CORS/Helmet/role-gating/URL-validation confirmed |

---

## Final Rule — Verdict

**`PASS WITH LIMITATIONS`**

- **Real E2E VERIFIED:** live job discovery (Arbeitnow + RemoteOK) through the app's own pipeline, real job/URL/identity verification, real deduplication (0 duplicates across repeated runs), and the apply-handoff flow (saved-only, no auto-apply, real external URL, user confirmation required). **4 real defects found and fixed**, each with a regression test; the full suite is green (934 tests) and typecheck/build/audit are clean.
- **NOT real-E2E exercised (code verified or externally blocked):** Gmail OAuth/sync/detection/events/notifications (no Google credentials), Adzuna (no credentials), job/resume matching against a real profile (no profile present), LinkedIn **job search** (not implemented; external access dependency — explicitly **not** claimed), and n8n runtime execution (no runtime). LinkedIn **publishing** and GitHub integrations remain code-level features, not re-validated live here.

The application is genuinely ready for real-world job discovery and user-controlled application handoff. It cannot be declared fully "everything works" because the Gmail career-intelligence half and real-profile matching were not exercised against live credentials in this environment.

---

## Gmail Real E2E Validation

**Date:** 2026-09-02 · **Scope:** Live Google OAuth + real Gmail sync + career intelligence chain.

### Overall verdict: `BLOCKED BY EXTERNAL CONFIGURATION`

Real OAuth cannot be exercised in this environment because the required Google client credentials are **absent** (empty values) and Google OAuth requires a real, Google-Cloud-registered Web Application client plus an interactive consent grant by a Google account owner. Per project rules, no fake credentials, mock Gmail API, or fabricated mailbox were used and none will be. Everything below that is not live-exercised is explicitly labelled **CODE VERIFIED**.

### Configuration status (checked, no secret values shown)

| Variable | Status |
| -------- | ------ |
| `GOOGLE_CLIENT_ID` | **missing** (empty in `server/.env`) |
| `GOOGLE_CLIENT_SECRET` | **missing** (empty) |
| `GOOGLE_CALLBACK_URL` | **missing** (absent from env; `.env.example` default `http://localhost:5001/api/gmail/callback`) |
| `GOOGLE_REDIRECT_URI` | absent from env (see note: not used in code) |
| `GOOGLE_GMAIL_SCOPES` | `https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send` (code default) |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | **present** — required to encrypt/decrypt stored Gmail tokens (AES-256-GCM) |

**Important source-true finding:** the application code (`server/src/integrations/gmail/gmailClient.ts:73,95`) uses **`GOOGLE_CALLBACK_URL`** as the OAuth `redirect_uri` for both the authorize URL and the token exchange. `GOOGLE_REDIRECT_URI` is listed in `.env.example` but is **never read by the code**. The URI that must match Google Cloud Console exactly is **`GOOGLE_CALLBACK_URL`**, not `GOOGLE_REDIRECT_URI`.

### OAuth result: `BLOCKED` (CODE VERIFIED)

The live flow (`/api/gmail/connect` → Google consent → callback → token exchange → `getProfile`) was not executed because no Google client exists in this environment. Code-path compliance is fully verified:
- Authorize URL uses `access_type=offline`, `prompt=consent`, requested scopes, and the user-bound random `state` (`gmailClient.ts:79-89`).
- Callback validates: non-empty `code`+`state` → `validateOAuthState` → state **one-time**, **user-bound**, **10-min expiry** (`oauthState.ts`), and rejects cross-user state (`controllers/gmail.ts:47-54`).
- Tokens are encrypted at rest with AES-256-GCM (`utils/encryption.ts`) and stored `select:false`; refresh token is required and stored; profile email is recorded (`gmail.ts:115-151`).

### Real Gmail Sync result: `BLOCKED` (CODE VERIFIED)

No API call was made (no access token). Sync logic verified:
- Incremental lookback query (default 1440 min, bounded `[60,10080]`) and `MAX_BODY_CHARS=6000`; bodies sent only to the classifier, **never logged** (no `console.*` in `gmail.ts`).
- Idempotent per `GmailConnection.user`; per-message dedupe via unique `{user, gmailMessageId}` + pre-check `CareerEmail.exists` (`gmail.ts:225-233`); self/agent-send loop guard (`isFromSelfOrAgent`).
- All `/api/gmail/*` routes require auth; `/sync-all` is admin-only (`routes/gmail.ts`).

### Real career email validation / status detection / interview event / application matching: `BLOCKED` (CODE VERIFIED)

No real mailbox exists here. Logic verified by the Gmail/career test suites (86 tests across `oauthState`/`gmail`/`gmailCareerStatus`, plus `careerEventIntelligence`):
- Status detection is forward-only via `isAllowedStatusTransition`; only high-confidence (`≥0.8`) derived stages can auto-advance; **never sets `applied` or `withdrawn`** (`gmail.ts:368-383`, `careerStatusTransitions.ts`).
- Interview/assessment/offer/rejection events extract dates/meeting URLs **only when explicitly present**; timezone is never guessed; meeting URLs validated http/https; events are idempotent per source Gmail message id.
- Application matching follows precedence `exact company+title → single-company`; ambiguous cases do **not** attach; unrelated applications are never modified; a manual `apply-status` still requires a detected-hiring-stage target and a permitted forward transition.

### Dashboard result: `BLOCKED` (CODE VERIFIED)

Dashboard aggregates recompute deterministically from persisted `CareerEmail`/`Application` records. With no real Gmail rows (no OAuth) and no real profile, the UI shows empty states only; no UI value was fabricated. The serializers strip `rawMetadata`/OAuth data.

### Self-notification result: `BLOCKED` (CODE VERIFIED)

Send path not exercised (no token). Recipient logic verified: recipient is **only** the user's own `Profile.notificationEmail` or their connected `googleAccountEmail` (`gmail.ts:536-537`) — never request-supplied, never a third party; gated by `gmailNotifyEnabled`; best-effort try/catch so a send failure never breaks sync; idempotent per message.

### Token refresh / reconnect: `BLOCKED` (CODE VERIFIED)

`ensureValidAccessToken` refreshes via `refreshAccessToken` when the stored token is expired/near expiry; encrypted refresh token is retrieved with `+encryptedRefreshToken`. Cannot force safe expiration against a live provider here; this remains **CODE VERIFIED** (not claimed as REAL E2E).

### Security result: `PASS` (code + repository audit)

- OAuth state: crypto-random (32 bytes), one-time, user-bound, 10-min expiry, revoked on reuse/expiry.
- Callback rejects missing/invalid/cross-user/used/expired state.
- Tokens encrypted at rest (AES-256-GCM, key from `GITHUB_TOKEN_ENCRYPTION_KEY`) and never logged/returned.
- Gmail message bodies never logged.
- All Gmail routes authenticated; `sync-all` admin-only; user data scoped by `req.user.id`.
- Disconnect deletes the local `GmailConnection`.
- Notification recipient not request-supplied.
- Git safe: `git ls-files` shows only `.env.example` files; `git check-ignore server/.env server/.env.bak` confirms both ignored; no credentials committed.

### Exact manual configuration still required (for a future live run)

1. In **Google Cloud Console**: create/select a project; enable the **Gmail API**; configure the **OAuth consent screen**; create a **Web Application** OAuth client.
2. Register the **exact redirect URI** in the client's "Authorized redirect URIs":
   - Local testing: `http://localhost:5001/api/gmail/callback`
   - Production (`https://ai-career-agent-1bn8.onrender.com`): `https://ai-career-agent-1bn8.onrender.com/api/gmail/callback`
   - (Derived from source: gmail router mounted at `/api/gmail`, callback route `/api/gmail/callback` — `app.ts:91`, `routes/gmail.ts:22`.)
3. Set in `server/.env` (never commit): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (exactly the registered URI). `GOOGLE_GMAIL_SCOPES` already defaults to `gmail.readonly + gmail.send`; do not broaden beyond the two documented scopes.
4. Ensure `GITHUB_TOKEN_ENCRYPTION_KEY` (already present) is stable across restarts so stored tokens decrypt.
5. Provide a real Gmail account the user controls, containing real or sent-to-self recruiter/career emails, and grant consent interactively.
6. (Consent mode) `gmail.send` and `gmail.readonly` are sensitive scopes; in an unverified-consuming-app / External testing mode the test user must be added to the consent screen's test users. Full production (unlisted-publishing) use may require Google verification.

### Note on `.env.example` discrepancy (not a code defect, flagged for the user)

`.env.example` documents `GOOGLE_REDIRECT_URI` which the code does not read; the operative variable is `GOOGLE_CALLBACK_URL`. This is a documentation inconsistency only, not a security or logic defect — no code change was made.

---

## Gmail OAuth Callback Auth Bug — Fix + Re-Validation (2026-09-02)

### Root cause

`GET /api/gmail/callback` was registered with the `authenticate` middleware (`routes/gmail.ts:22`). The Google OAuth flow redirects the **browser** back to the callback carrying only `state` + `code` query params and **no application `Authorization` header**. The `authenticate` middleware rejects any request without a `Bearer` token with `401 "No authorization header provided"` **before the controller runs**, so the callback always failed in real browser-driven OAuth even though Google authorization succeeded.

Additionally, the callback controller derived the user identity from `req.user!.id` (the JWT) and rejected when it did not equal the state's bound user — a design that is impossible once the callback no longer carries a JWT.

### Fix (source changes)

1. **`server/src/routes/gmail.ts`** — removed `authenticate` from only the `/api/gmail/callback` route. Every other Gmail route (`/connect`, `/status`, `/disconnect`, `/sync`, `/sync-all`, `/emails`, `/emails/:id`, `/emails/:id/apply-status`) remains behind `authenticate`; `/sync-all` keeps `requireRole(Role.ADMIN)`.
2. **`server/src/controllers/gmail.ts`** (`callback`) — removed the `req.user!.id` dependency and the `stateValidation.userId !== req.user!.id` check. The user identity is now obtained **exclusively from `validateOAuthState(state)`** (`stateValidation.userId`) and passed to `completeConnection(userId, code)`. No Authorization header is read.

### Security reasoning (unchanged invariants, now enforced via state alone)

- **Cryptographically random** state (32 bytes via `crypto.randomBytes(32).toString("hex")`) — unchanged.
- **One-time use** (`used` flag flipped by `validateOAuthState`) — unchanged; a replay of the same state returns `400 "OAuth state already used"`.
- **Expiration** (10-minute TTL via `STATE_EXPIRY_MS`) — unchanged.
- **User binding**: `generateOAuthState(userId)` binds the state to the user who called `/connect`. The callback reads the user from the validated state, so a state generated for user A can **only ever** persist a connection for user A — never for another user. There is no requestor-supplied identity to abuse.
- State is validated **before** the Google authorization code is exchanged.
- Cross-user safety is inherent: the bound `userId` is the only identity used, so no state can create a connection for a different user.
- Tokens remain encrypted at rest (AES-256-GCM, `GITHUB_TOKEN_ENCRYPTION_KEY`), stored `select:false`, never logged/returned.
- Only the callback is header-exempt; `sync`, `sync-all`, and all other Gmail endpoints still require an authenticated JWT, and `sync-all` remains admin-only.

### Regression (all green)

- Server: **48 suites / 938 tests passed** (was 934; +4 net new callback/auth tests).
- Server typecheck clean; client typecheck clean; client build clean; `npm audit` 0 (server + client).

New/updated tests in `server/tests/gmail.test.ts`:
- A. callback **without Authorization header** + valid state → reaches callback logic, persists connection, 302.
- B. invalid state → 400.
- C. expired state (fake timers +11 min) → 400.
- D. already-used/replayed state → 400 on second use.
- E. state bound to another user cannot create a connection for a different user (connection bound to the state owner only).
- F. `/api/gmail/sync` without Authorization header → 401 (route still authenticated).
- G. `/api/gmail/sync-all` admin-only (already covered in `gmailCareerStatus.test.ts`: 401 unauthenticated, 403 non-admin).

### Real-server verification (live, non-mocked; consent step user-driven)

The Google Cloud credentials are now **present** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` = `http://localhost:5001/api/gmail/callback`, `GOOGLE_GMAIL_SCOPES`), Mongo is up, and a real server was registered with a real test user:

- `/api/gmail/connect` returns a correctly formed authorize URL: `redirect_uri=http://localhost:5001/api/gmail/callback`, `scope=gmail.readonly,gmail.send`, `access_type=offline`, `prompt=consent`, crypto-random `state` — **verified live**.
- **The exact bug case is fixed**: `GET /api/gmail/callback?state=<valid>&code=<bad>` with **no Authorization header** no longer returns `401`. It now reaches the callback, passes state validation, and proceeds to a **real** Google token exchange (rejected with 500 because the code is intentionally fake — a fabricated real code is never used).
- **One-time state consumption verified live**: the second callback using the same (consumed) state returns `400 "OAuth state already used"`.
- Google OAuth endpoint reachable from this host (302).

### Real OAuth consent + real Gmail sync: `PENDING USER CONSENT` (not fabricated)

The final step — approving Google's consent screen in a browser signed into the real test Gmail, which yields a genuine authorization code for a **real** token exchange and **real** `gmail.sync` — requires an interactive human session with the Google account that this agent cannot perform. The live authorize URL was generated and surfaced to the user. This is the only remaining unverified step and is **DELIBERATELY NOT FABRICATED**.

### No code commit

No commit or push was made; all changes remain in the working tree.

---

## Real Gmail E2E Execution Results (2026-09-02) — LIVE, not mocked

### Environment
- Real server running (`ts-node-dev` on `http://localhost:5001`) against local MongoDB; real Google Cloud OAuth client (`GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` set).
- Real connected Gmail account: **`hrssohan2@gmail.com`** (app user `6a9815d7abc6f8fb6d95a465`, role USER).
- Real sync executed via the application's own production endpoint **`POST /api/gmail/sync-all`** (admin-only), which iterates the connected user via `GmailService.syncEmails` → real Gmail API via the app's `GmailClient`.

### A. OAuth connection — **PASS**
- `GmailConnection` exists and is associated with the **correct** app user (`6a9815d7abc6f8fb6d95a465`), `googleAccountEmail = hrssohan2@gmail.com`, `isActive: true`, `tokenExpiry` set.
- Both `encryptedAccessToken` and `encryptedRefreshToken` present (AES-256-GCM). **Values never printed**; only presence + character length (253) disclosed. Encryption round-trip verified OK in-process.

### B. Gmail API access — **PASS**
- Real sync-all returns real counts: `synced 18`, `careerEmails 5`, `skipped 13`, `failed 5`. Repeated runs constant (18/5/13/5), i.e. real, stable Gmail responses.
- Direct probe through the app's `GmailClient`: `listMessages` returned **8** real messages (subject/message-id probe), `getMessageFull` succeeded for all (0 full-fetch failures). Connected account confirmed correct (`hrssohan2@gmail.com`).

### C. Real Gmail message retrieved — **PASS**
Real message IDs retrieved from the live mailbox, e.g. `1a06…c34`, `1a06…e1`, etc. 7 of 8 sampled messages had empty `payload.body.data` (bodies empty/extracted elsewhere); 1 had a real 69 608-char body. Senders/domains were real. Full email bodies and tokens were **not** printed.

### D. CareerEmail persisted — **FAIL (external blocker)**
**0 `CareerEmail` documents persisted** for the connected user (and 0 in the DB) after 3 real sync runs. Root cause is **not** a code defect and **not** zero messages — it is that career **classification** requires Claude, and the real **Anthropic API returned `400 "Your credit balance is too low to access the Anthropic API"`**. In `services/gmail.ts`, `classifyCareerEmail` must succeed before `careerEmail.save()` (line 359); on failure it increments `failed` and `continue`s (line 277), so no record is persisted. This is an **external billing/credits blocker**, not fabricated.

### E. Career status detection — **BLOCKED**
Gated behind classification (`resolveCareerStatus` runs only after successful `classifyCareerEmail`, `gmail.ts:281-293`). Because classification is credit-blocked, no real status detection ran. Code path is verified by the 938-test regression.

### F. Career event detection — **BLOCKED**
Same dependency on classification (`resolveCareerEventExtraction` at `gmail.ts:306-322`). Not exercised on real data due to the credit blocker. Logic covered by the regression suites.

### G. Application matching — **BLOCKED**
Requires classification; additionally the connected user has **0 Application records**, so there is nothing to match. Cannot claim PASS. `matchApplication` precedence logic is unchanged and covered by unit tests.

### H. Duplicate / idempotency — **PASS (structural)**
3 real `sync-all` runs produced identical counts and **no `CareerEmail` accumulation** (0 docs after each run). Because classification blocks persistence, no duplicate polish occurs; the pre-filter + `CareerEmail.exists({user, gmailMessageId})` dedupe and the unique index remain in place and are covered by tests. No duplicate message records were ever created across runs.

### I. Token refresh — **BLOCKED (not forced on live)**
Stored `encryptedRefreshToken` present and expiry set. A live forced refresh was **not** triggered because the current access token is still within its validity window and forcing a refresh risks consuming the refresh token against Google. The refresh code path (`ensureValidAccessToken` → `refreshAccessToken`) is code-verified and unit-tested. Marked BLOCKED rather than PASS to avoid an unverified claim.

### J. Security — **PASS**
- All authenticated Gmail endpoints — `GET /api/gmail/status`, `POST /api/gmail/sync`, `GET /api/gmail/emails`, `GET /api/gmail/connect` — returned **401** without an `Authorization` header.
- `POST /api/gmail/sync-all`: **403** for a plain USER, **200** for ADMIN (remains admin-only).
- No token values or raw email bodies appear in `gmail.ts` (no `console.*`) and none were found in the scanned server logs.
- Tokens remain encrypted at rest; never returned by any endpoint.

### K. Full regression — **PASS**
Server: **48 suites / 938 tests passed** (incl. Gmail/career suites: 122 tests). Server + client typecheck clean.

### Verdict
- **PASS:** OAuth connection, Gmail API access, real message retrieval, idempotency structure, security, full regression.
- **FAIL (external):** CareerEmail persistence — because Anthropic billing has no credits.
- **BLOCKED:** career status/event detection and application matching (downstream of classification), token refresh (not forced).

### Remaining blocker (exact remediation)
Add Anthropic credits / resolve billing at console.anthropic.com so the **existing** `ANTHROPIC_API_KEY` can classify. Then re-run `POST /api/gmail/sync-all`; the real sync path will flow classification → `CareerEmail.save()` → status/event detection → (with an existing Application) forward-only auto-status. No code change is required to unblock. **After unblocking**, this section's D/E/F/G must be re-validated — they remain honestly marked FAIL/BLOCKED today, not fabricated.

### No code commit
No commit or push was made.
