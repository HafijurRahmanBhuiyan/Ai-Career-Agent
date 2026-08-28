# MILESTONE 16 FINAL REPORT

## LinkedIn Publishing & Career Opportunity Execution Layer

Task: TRACK A — real LinkedIn member publishing via the official LinkedIn API (`w_member_social` / Posts API) with a human "Publish" step; TRACK B — application review-and-handoff + explicit-confirmation execution layer with an advisory-only Claude job-fit assist. Built on top of the completed Milestone 15 workflow.

---

### 1. Executive Summary

Milestone 16 turns the M15 "Approved — Ready to Publish" gate into a **real publishing step** and turns a saved application into a **review → handoff → explicit-confirm** execution flow. Nothing is published or applied to automatically. Claude remains strictly advisory. Every external action (publish a post, confirm an application as `applied`) requires explicit human action, and a status only becomes `published` or `applied` after a real external success or explicit user confirmation respectively.

- **Track A — LinkedIn Publishing.** User OAuth-connects their LinkedIn account; an approved draft is published with a real `POST /rest/posts` call requiring `w_member_social`. `published` is **only** written after a genuine API `201/200/204` that returns a real `urn:li:` post id in `x-restli-id`.
- **Track B — Job/Application Execution.** A saved application is classified by `applyCapability` (`external_url | supported_api | manual_required`) without inventing URLs or claiming automation; the status advances to `applied` **only** on `{ submitted: true }` explicit confirmation. Claude job-fit assist returns an advisory assessment and never changes status.

---

### 2. Verified LinkedIn API Facts (used to build Track A)

- Endpoint: `POST https://api.linkedin.com/rest/posts`; requires the `w_member_social` scope.
- Headers: `Authorization: Bearer <token>`, `X-Restli-Protocol-Version: 2.0.0`, `Linkedin-Version: YYYYMM` (no version prefix in path).
- Text-only (no media/scheduling param — LinkedIn's pivoted posting model has no scheduling parameter, so none is claimed).
- Payload: `{ author: "urn:li:person:{id}", commentary, visibility: "PUBLIC", distribution: { feedDistribution, targetEntities, thirdPartyDistributionChannels }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor }`.
- Success → **201** (+ possible 200/204) with the post URN in the `x-restli-id` response header.
- Errors: 401/403/404/422/429; rate limit ~100 posts/day/member. `429/500/503` are classified retryable.
- OAuth token/person endpoints: `/oauth/v2/authorization`, `/oauth/v2/accessToken`, `/v2/userinfo` (`sub` → `urn:li:person:{sub}`).
- **There is NO public API to "apply to an arbitrary LinkedIn job."** Track B therefore does **not** fake or browser-automate any application; it hands off to the real URL and records `applied` on explicit user confirmation.

---

### 3. OAuth & Connection (Track A)

- `GET /api/linkedin/connect` → returns `{ authorizeUrl, state }`. `state` is a signed, expiring, one-time token bound to the user via the existing `oauthState` util (`generateOAuthState`), reused consistently with Gmail.
- `GET /api/linkedin/callback?code&state` — validates `state` against the authenticated `req.user!.id`, exchanges the code for tokens, marks state used, fetches `/v2/userinfo`, and upserts a `LinkedInConnection` **scoped to the user** (unique index). Redirects to `/dashboard/integrations?linkedin=connected`.
- `GET /api/linkedin/status` → `{ connected: false }` or `{ connected: true, linkedin: { memberId, profileUrn, displayName, isActive, connectedAt, tokenExpiry, lastUsedAt } }` (safe DTO — never returns tokens).
- `POST /api/linkedin/disconnect` — removes the user's connection (404 if none / cross-user).
- **Tokens are encrypted** with the existing `aes-256-gcm` scheme (`encryptToken`/`decryptToken`, key `GITHUB_TOKEN_ENCRYPTION_KEY`) and stored `select:false`. Raw tokens are never exposed and never accepted from the client. The OAuth callback userId is **always** `req.user!.id`, never taken from the callback query.

---

### 4. LinkedIn Client (Official API; no faking)

`server/src/integrations/linkedin/linkedinClient.ts`:
- `getLinkedInApiVersion()` (default `202605`, overridable via `LINKEDIN_API_VERSION`) and `getLinkedInScopes()` (default `openid profile email w_member_social`).
- `LinkedInClient` — minted per token with `Linkedin-Version`, `X-Restli-Protocol-Version: 2.0.0`, `Authorization: Bearer`.
- `getUserInfo()` via `/v2/userinfo`; `createTextPost()` — sends the official payload, and returns `{ postUrn }` **only** when the status is `201/200/204` and `x-restli-id` starts with `urn:li:`. Any other status → `LinkedInError`.
- `LinkedInError` carries `statusCode` + optional `code`; `toPersonUrn(memberId)` builds `urn:li:person:{id}`.
- Static `getOAuthAuthorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken`.

---

### 5. LinkedIn Service — Publish Orchestration

`server/src/services/linkedIn.ts` (`LinkedInService`):
- `getAuthorizeUrl`, `completeConnection`, `disconnect`, `getStatus`, private `getAccessToken` (decrypt + automatic refresh on expiry using `encryptedRefreshToken`; 401 "reconnect" when refresh fails).
- `publishDraft(userId, draftId)`:
  - Guards: invalid ObjectId → 404; not found / not owned → 404; `archived` → 400; already `published` → 400; not `approved` → 400; empty body → 400.
  - Sets `publishing` + `lastPublishAttemptAt`, clears error fields.
  - No connection → `publish_failed` with `NOT_CONNECTED` (preserves draft content).
  - Resolves the access token (decrypt/refresh); a token failure → `publish_failed` with the classified code/message.
  - Calls `createTextPost`; a `LinkedInError` → `publish_failed` with safe code/message; `429/500/503` marked retryable.
  - On success → `published` + `publishedAt` + `linkedinPostUrn` (+ `lastPublishAttemptAt`), clears error fields, records `lastUsedAt`.
- **No automatic retry.** A `publish_failed` draft is preserved for the user to review and explicitly retry.

---

### 6. Draft Lifecycle & Audit Fields

`LinkedInDraft.status` is now: `draft | reviewed | approved | publishing | published | publish_failed | archived`.

New audit/publish fields: `publishedAt`, `linkedinPostUrn`, `lastPublishAttemptAt`, `publishErrorCode`, `publishErrorMessageSafe` (safe, truncated to 400 chars).

- `publish_failed` is a **terminal-preserving** state: the draft's content (`hook`/`body`/`hashtags`) is untouched and can be re-approved/re-published by the user.
- The list query validator (`listDraftsQuerySchema`) accepts all lifecycle statuses now; invalid/unknown statuses → 422.
- **M15 regression fix:** the old M15 test that asserted `status=published` is invalid was updated, because M16 legitimately adds `published` to the enum. A replacement test asserts invalid statuses still → 422 and that all M16 lifecycle statuses are accepted.

---

### 7. Publish Endpoint

- `POST /api/projects/linkedin-drafts/:draftId/publish` → `publishLinkedInDraft` controller → `LinkedInService.publishDraft`.
- Response: `200 { draft, posted: true, postUrn, message }` on success, or `200 { draft, posted: false, message }` when not published (guard errors throw their own status; token/API failures surface as `publish_failed` with 200 + `posted: false`).
- The publish route is mounted under the drafts router (before `/api/projects`), consistent with M15's route-ordering lesson.

---

### 8. Apply Capability Classifier (Track B)

`server/src/services/applyCapability.ts` — `classifyApplyCapability(job)` + `APPLY_CAPABILITIES = ["external_url","supported_api","manual_required"]`:

- `external_url` → a real `https://` apply/job URL exists (non-LinkedIn path); `handoffUrl` = the real URL.
- `supported_api` → **only** when `metadata.applyApi ?? rawSource.applyApi === "supported_api"` is explicitly declared. Never inferred from a URL or because a source is well-known.
- `manual_required` → no usable URL / no declared API; for LinkedIn sources this is the default **even when a URL exists** (a LinkedIn job is never automated just because it is on LinkedIn). `handoffUrl` = real apply/job URL if present, else `null`.
- **Never invents a URL** (uses `hasHttpUrl` which only accepts real `http(s)` strings).

---

### 9. Application Execution Service (Track B)

`server/src/services/applicationExecution.ts` (`ApplicationExecutionService`), reusing `loadOwnedApplication` (user-scoped, invalid ObjectId → 404):

- `getExecutionInfo` — read-only `{ application, job, capabilityInfo: { capability, label, handoffUrl, canApplyInline: false, statusUnchanged: true } }`. **No status change.**
- `prepare` — returns review instructions, `capabilityInfo`, `source`, and `review.recommendedSteps` + `statusWillChangeOnConfirm: false`. **No status change; nothing opened server-side.**
- `execute({ submitted })`:
  - `submitted: false` → returns handoff info only; status unchanged.
  - `submitted: true` → the user's explicit confirmation they completed the external application. Sets status `applied` + `appliedAt` and emits a `status_changed` timeline event (`createStatusChangedEvent`). For `supported_api`, status still only advances on explicit confirmation, with a message clarifying **no automated API submission occurred** this milestone. Re-confirming an already-applied app is idempotent.
- `JOB_EXECUTION_FIELDS` includes `metadata rawSource` so `supported_api` classification works end-to-end (added during this milestone).

---

### 10. Job-Fit Assist (Claude, Advisory Only)

- `POST /api/applications/:id/fit-assist` (body must be `{}`, strict → non-empty body → 422) → `assistJobFit`.
- Loads the user's application + linked job; builds a career payload from the user's `Profile`, `Skill`, `Experience`, and approved (`status: "ready"`) `ProfessionalEvidence` (`MAX_SKILLS = 60`, `MAX_EVIDENCE = 12`).
- Calls Claude (`assistJobFit` → `JOB_FIT_ASSIST_SYSTEM_PROMPT` + `buildJobFitAssistUserMessage`); the prompt instructs Claude to use only supplied evidence and **never fabricate** qualifications/skills/experience/certifications.
- Output validated by strict Zod (`jobFitAssistOutputSchema`, `.strict()`): `overallFit strong|moderate|weak|uncertain`, `summary`, `highlights`, `gaps`, `uncertainties`, `suggestedQuestionsToAskEmployer`. Extra/unknown fields or malformed output → **422**.
- Response: `{ assessment, advisoryOnly: true, statusUnchanged: true }`. **Never changes status.**

---

### 11. Professional Evidence Adapter (one shared surface, no second model)

- `server/src/services/jobMatchTypes.ts`: added a `professionalEvidence` array to `JobMatchProfilePayload` (minimal; no second matcher/model).
- `server/src/services/jobMatchProfile.ts`: queries approved `ProfessionalEvidence` (`MAX_PROFESSIONAL_EVIDENCE = 12`) and maps M15 fields (`professionalSummary`, `technicalSkills`, `technologies`, `roleRelevantKeywords`, `projectDomain`, `senioritySignals`) into the payload.
- **Accepted tradeoff:** M15's `architecturePractices` is intentionally NOT carried into the adapter (documented, deliberate).

---

### 12. Controllers & Routes

**LinkedIn** (`/api/linkedin`, JWT): `GET /connect`, `GET /callback`, `GET /status`, `POST /disconnect`.

**ProfessionalContent** (drafts router, before `/api/projects`): added `POST /:draftId/publish`.

**Applications** (`/api/applications`): added, before `GET /:id`:
- `GET /:id/execution`
- `POST /:id/execution/prepare`
- `POST /:id/execution` (validated by `executeApplicationSchema`, strict)
- `POST /:id/fit-assist` (validated by `jobFitAssistSchema`, strict `{}`)

All JWT-authenticated; all user-scoped.

---

### 13. Validation Contract (Strict Zod)

- `executeApplicationSchema` — `{ submitted: boolean }`, `.strict()` → missing/wrong type/invalid type → **422**; unknown fields → **422**.
- `jobFitAssistSchema` — `z.object({}).strict()` → any body except `{}` → **422**.
- `jobFitAssistOutputSchema` — strict Zod output validation of Claude's assessment (unknown fields → 422).
- `listDraftsQuerySchema` — status enum extended to all M16 lifecycle statuses; invalid → 422.
- `executionParamsSchema` — `{ id: string.min(1) }`.
- Invalid ObjectId → **404** (not 500); cross-user access → **404**.

---

### 14. Security & Ownership (IDOR Hardening)

- JWT required on every new route; identity always `req.user!.id`; **no userId ever taken from the OAuth callback or client**.
- All queries scoped `{ user: req.user!.id, ... }`; cross-user / invalid id → 404.
- Safe DTOs strip `user`, `__v`, raw provider metadata, tokens, and member surfaces.
- `LinkedInConnection` stores `encryptedAccessToken`/`encryptedRefreshToken` with `select:false`; `toSafeJob`/`safeApplication` never leak them.
- Strict Zod 422 on malformed writes; encryption reuses the existing `GITHUB_TOKEN_ENCRYPTION_KEY` (aes-256-gcm) — consistent with Gmail, no new key scheme.

---

### 15. Claude Rules Enforced

Claude **may**: analyze approved projects, generate LinkedIn post drafts, and produce a job-fit assessment (advisory).
Claude **may NOT**: publish, re-publish, send email, apply to jobs, change statuses, create external side effects, or fabricate qualifications/skills/experience/certifications. Publishing requires a real API call initiated by an explicit user action; job-fit assist returns `advisoryOnly: true` and `statusUnchanged: true`.
No background workers, cron, or queues anywhere.

---

### 16. Task Flow Implemented (Track A)

```
CONNECT        user clicks "Connect LinkedIn" → OAuth authorize URL (signed state)
CALLBACK       state validated; tokens exchanged + encrypted; connection upserted (select:false)
PUBLISH        user clicks "Publish" per approved draft → POST /rest/posts (real API)
   ├─ success → status published + publishedAt + linkedinPostUrn (x-restli-id urn:li:)
   └─ failure → status publish_failed + safe error code/message; content preserved; no auto-retry
```

### 17. Task Flow Implemented (Track B)

```
SAVE        application created as status `saved`
REVIEW      GET/POST /execution(+prepare) → capability + real handoff URL; status unchanged
HANDOFF     user opens the real external URL; completes the application themselves (never faked)
CONFIRM     user clicks "Confirm applied" → POST /execution { submitted: true } → status `applied` + appliedAt
ADVISE      POST /fit-assist → advisory assessment only; statusUnchanged: true
```

---

### 18. Models

**`LinkedInConnection`** (`server/src/models/LinkedInConnection.ts`, new):
- `user` (unique), `linkedinMemberId`, `linkedinProfileUrn`, `displayName`, `encryptedAccessToken` + `encryptedRefreshToken` (`select:false`), `tokenExpiry`, `scopes`, `isActive`, `connectedAt`, `lastUsedAt`, `lastValidatedAt`, timestamps.

**`LinkedInDraft`** (modified): statuses extended (`publishing`, `published`, `publish_failed`) + `publishedAt`, `linkedinPostUrn`, `lastPublishAttemptAt`, `publishErrorCode`, `publishErrorMessageSafe`.

**`Job`** (modified): `applyCapability` (`ApplyCapability` enum, default null) + exported `ApplyCapability` type.

---

### 19. New / Modified Files (server, M16)

**New**
- `integrations/linkedin/linkedinClient.ts` (official API client + `LinkedInError` + OAuth statics + `toPersonUrn`)
- `models/LinkedInConnection.ts`
- `services/linkedIn.ts` (`LinkedInService`), `services/applyCapability.ts`, `services/applicationExecution.ts`, `services/jobFitAssist.ts`
- `controllers/linkedin.ts`, `controllers/applicationExecution.ts`
- `routes/linkedin.ts`
- `validators/applicationExecution.ts`, `validators/jobFitAssist.ts`
- `integrations/claude/jobFitAssistPrompts.ts`
- Tests: `linkedinPublish.test.ts` (19), `applicationExecution.test.ts` (17), `jobFitAssist.test.ts` (7)

**Modified**
- `models/LinkedInDraft.ts` (statuses + publish audit fields), `models/Job.ts` (`applyCapability`)
- `controllers/professionalContent.ts` (+`publishLinkedInDraft`), `routes/professionalContent.ts` (+publish)
- `routes/applications.ts` (+execution/fit-assist routes)
- `validators/professionalContent.ts` (status enum)
- `services/jobMatchTypes.ts`, `services/jobMatchProfile.ts` (evidence adapter)
- `integrations/claude/claude.service.ts` (+`assistJobFit`)
- `app.ts` (mounts `/api/linkedin`)
- `.env.example` (LinkedIn vars)
- `tests/professionalContent.test.ts` (updated for M16 lifecycle statuses)

---

### 20. New / Modified Files (client, M16)

**Modified**
- `pages/Applications.tsx` — added `ApplicationExecutionSection` (capability, review & prepare, open handoff site, confirm-applied modal) and `JobFitAssistSection` (advisory assessment) in the application detail modal.
- `types/application.ts` — `ApplyCapability`, `CapabilityInfo`, `ExecutionInfo`, `JobFitAssistResult`, `JobFitOverall`.
- `pages/ProfessionalContent.tsx` — LinkedIn connection panel (connect/status/disconnect), publish button + "Published"/"Publish Failed"/Retry states, publish confirmation modal; all new status labels/styles.
- `types/professionalContent.ts` — extended `LinkedInDraftStatus`/`LinkedInDraft` (publish audit fields) + `LinkedInConnection`.

---

### 21. Routes Ordering & Mounting

- `/api/linkedin` is mounted via `app.use("/api/linkedin", linkedinRoutes)`.
- Publish is mounted under the drafts router **before** `/api/projects` (avoids the project `/:id` catch-all swallowing `linkedin-drafts`).
- Track B routes under `/api/applications/:id/...` are registered **before** `GET /:id` so the detail catch-all does not swallow `execution`/`fit-assist`.

---

### 22. Use Cases Covered by Tests

**LinkedIn (`linkedinPublish.test.ts`, 19):** auth on every endpoint; connect returns signed state; status not-connected then connected; cross-user status isolation; callback stores encrypted tokens (verified via `decryptToken`); callback missing code/state → 400; invalid state → 400; disconnect 200 and cross-user 404; publish approved draft → `published` + post URN; not-approved → 400 (status preserved); already-published → 400; archived → 400; not-connected → `publish_failed NOT_CONNECTED` (content preserved); retryable `LinkedInError` (429) → `publish_failed HTTP_429`; cross-user draft → 404; invalid id → 404; publish API endpoint auth + success (`posted: true`).

**Execution (`applicationExecution.test.ts`, 17):** auth on all four endpoints; classification `external_url`/`supported_api`/`manual_required` (incl. no-URL, LinkedIn manual, `supported_api` only when declared, never from URL, never invents URLs); `GET /execution` read-only; 404 invalid/cross-user; `prepare` review + real handoff URL + status untouched; `submitted:false` never changes status; `submitted:true` → `applied` + `appliedAt`; re-confirm idempotent; `supported_api` applied only on explicit confirmation with clarifying message; strict 422 on unknown fields and wrong type; fit-assist strict `{}` 422 on non-empty body.

**Job-fit assist (`jobFitAssist.test.ts`, 7):** auth; valid advisory `{ assessment, advisoryOnly:true, statusUnchanged:true }` with no status change; strict 422 on fabricated/unknown field; malformed output → 422; cross-user 404; invalid id 404; no sensitive metadata leak.

**M15 regression (updated):** `status=published` now valid (M16); truly-invalid status → 422; all M16 lifecycle statuses accepted.

---

### 23. Test Results (server)

- **Full suite:** `27` test suites passed, `520` tests passed, `0` failed.
- M16 suites: `linkedinPublish.test.ts` (19), `applicationExecution.test.ts` (17), `jobFitAssist.test.ts` (7) = **43 new tests**; plus `professionalContent.test.ts` updated (26 → 27).
- Baseline M15 = 476 tests / 24 suites → 476 + 43 new + 1 updated = **520**.
- Command: `cd server && npm test` (runs `jest --forceExit --detectOpenHandles`).

---

### 24. Typecheck Results

- **Server:** `cd server && npx tsc --noEmit` → **passes** (no errors).
- **Client:** `cd client && npx tsc --noEmit` → **passes** (no errors).

---

### 25. Frontend Build Results

- `cd client && npm run build` (`tsc -b && vite build`) → **success**, `118 modules transformed`, `dist/assets/index-CfXh_5Gb.js` (415.97 kB / gzip 112.67 kB), built in ~1.05s. No new dependencies added; uses existing Tailwind conventions.

---

### 26. Git Diff / Repo State Verification

- HEAD: `3068e25 feat: add career application analytics and performance intelligence` (unchanged; **M16 — like M15 — is NOT committed**).
- Branch `main`, upstream `origin/main`; `git log origin/main..HEAD` empty → not ahead of upstream; no push performed.
- `git diff --check`: **clean** (no whitespace errors).
- `git status --short` shows M15 + M16 changes as modified/untracked (uncommitted) across the working tree.
- **Nothing committed, nothing pushed** — objective satisfied.

---

### 27. Secret / Debug / Hygiene Scan

- None of the M16 source files contain `console.log`/`console.debug`/`console.warn`/`debugger`.
- The only `console.log` occurrences in `server/src` are pre-existing startup/DB connection messages in `server.ts` and `config/database.ts` (not M16 code, unchanged).
- No real API keys, passwords, or secrets in M16 code. LinkedIn/Gmail/Claude values in tests are test fixtures (e.g. `test-client-secret`), not real credentials.
- No raw OAuth tokens stored or exposed; tokens encrypted at rest (`select:false`).
- `git diff --check` clean.

---

### 28. Environment Variables / Config Changes

- `server/.env.example` adds: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_CALLBACK_URL=http://localhost:5001/api/linkedin/callback`, `LINKEDIN_API_VERSION=202605`, `LINKEDIN_SCOPES=openid profile email w_member_social`. The old `LINKEDIN_REDIRECT_URI` was removed (client falls back to `LINKEDIN_CALLBACK_URL || LINKEDIN_REDIRECT_URI`).
- Encryption reuses `GITHUB_TOKEN_ENCRYPTION_KEY` (aes-256-gcm), consistent with Gmail — no new key scheme.
- No `.env` files modified or committed.

---

### 29. Features Omitted / Out of Scope (By Design)

- **No fake "apply to arbitrary LinkedIn job" API** — no such public API exists; Track B hands off to the real URL and records `applied` on explicit user confirmation only.
- **No browser automation / scraping** (no Puppeteer/Playwright) anywhere.
- **No automatic publication** — publishing only via explicit user click + real API success.
- **No scheduled/scheduling publishing** — the official API has no scheduling parameter.
- **No auto-retry** on publish failure; no background workers/cron/queues.
- **No raw token storage/exposure**; OAuth `userId` never taken from callback.
- **Gmail stays read-only** (unchanged).
- **No new application statuses** introduced (review/execution modeled as endpoints; start status remains `saved`).

---

### 30. Limitations

- Publishing requires real LinkedIn OAuth credentials + the `w_member_social` scope; in production the user must connect their LinkedIn account, and the ~100 posts/day/member rate limit applies.
- `supported_api` is intentionally conservative: it only reports when a source explicitly declares `applyApi === "supported_api"`; importing sources that declare it is future work.
- Job-fit assist depends on `ANTHROPIC_API_KEY` and on the user having profile/skill/experience/evidence data; output is advisory.
- The evidence adapter surfaces `professionalEvidence` (from M15 fields) but intentionally omits `architecturePractices` (documented tradeoff).
- LinkedIn token refresh relies on LinkedIn's OAuth refresh tokens being issued (OpenID Connect); if a token expires without a refresh token, the user must reconnect.

---

### 31. Recommended Next Milestone (#17)

- **LinkedIn fulfillment & analytics:** post-performance read-back (impressions/engagement via LinkedIn API), draft rotation, and a post archive.
- **Source-specific apply implementations:** wire a real `supported_api` submit path for a first-party source that declares an official apply API (with explicit confirmation), and richer handoff tracking (deep links, "applied" verification).
- **Multi-integration connection manager** to unify LinkedIn/Gmail/GitHub OAuth lifecycle, revocation, and token rotation.
- **Portfolio/skill-surface export** from `professionalEvidence`/matcher payloads into the job opportunity feed (feature F surfacing, without a second matcher).

---

### 32. Confirmation: Nothing Committed / Pushed

Confirmed via: `git log --oneline -1` = `3068e25` (pre-M15/M16), `git status --short` shows all changes as modified/untracked (uncommitted), `git log origin/main..HEAD` empty (nothing ahead of upstream), and no `git push` was performed. **No commits created, no pushes made.**

---

### 33. M15 Update Note

Milestone 15's "Approved — Ready to Publish" gate is now actually publishable via Track A. The M15 workflow description in the README was preserved and updated to reflect that M16 adds the real publishing step; the M15 report (this repo's `MILESTONE 15 FINAL REPORT.md`) remains accurate for what M15 itself delivered (no `published` status existed in M15).

---

### 34. Sign-Off Checklist — Track A (LinkedIn)

- [x] Real LinkedIn OAuth connect/callback/status/disconnect with signed, expiring, one-time state.
- [x] Real `POST /rest/posts` publishing (`w_member_social`, Restli 2.0.0, `Linkedin-Version`); `published` only on real 201/200/204 + `urn:li:` id.
- [x] Draft lifecycle extended (`publishing`, `published`, `publish_failed`) with full audit fields; content preserved on failure; no auto-retry.
- [x] Encrypted tokens at rest (`select:false`); no raw-token storage/exposure; OAuth userId never from client.
- [x] Claude advisory only; no auto-publish; no background workers.
- [x] Frontend: connect/disconnect panel, Publish/Retry, Published + post-URN display, confirmation modal.

### 35. Sign-Off Checklist — Track B (Application Execution)

- [x] `applyCapability` classifier (`external_url | supported_api | manual_required`) — no invented URLs; LinkedIn never automated just because it is LinkedIn.
- [x] Read-only `GET /execution`, review `POST /prepare`, and `POST /execution` — status advances to `applied` **only** on `{ submitted: true }`.
- [x] `supported_api` marks applied only on explicit confirmation, with a clarifying "no automated API submission" message; re-confirm idempotent.
- [x] Job-fit assist — advisory only (`advisoryOnly: true`, `statusUnchanged: true`), strict Zod output, no fabrication, no status change.
- [x] Professional evidence surfaced into matcher payload via one adapter (no second model); `architecturePractices` intentionally omitted (tradeoff).
- [x] Security: JWT, user-scoped, 404 on cross-user/invalid id, strict Zod 422, safe DTOs.

### 36. Final Verification

- [x] Server full suite: **27 suites / 520 tests pass** (no regressions; M15 476 preserved).
- [x] Server `tsc --noEmit` passes.
- [x] Client `tsc --noEmit` passes; `npm run build` passes.
- [x] `git diff --check` clean; secret/debug scan clean (M16 files; pre-existing startup logs only).
- [x] README updated to Milestone 16 (M1–15 preserved); API tables + env vars updated.
- [x] `MILESTONE 16 FINAL REPORT.md` written (this document).
- [x] Nothing committed or pushed.
