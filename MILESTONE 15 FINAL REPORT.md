# MILESTONE 15 FINAL REPORT

## Professional Content & Career Opportunity Workflow

Task: APPROVED GITHUB PROJECT → CLAUDE PROFESSIONAL ANALYSIS → LINKEDIN DRAFT → HUMAN REVIEW → READY-TO-PUBLISH (stops there).

---

### 1. Executive Summary

Milestone 15 delivers the **Professional Content & Career Opportunity Workflow**: a human-in-the-loop pipeline that turns an **explicitly approved** GitHub project into evidence-backed professional content (a LinkedIn post draft). Claude acts strictly as a **suggestion engine**. The workflow deliberately **stops at "Approved — Ready to Publish"** — there is **no LinkedIn write integration, no auto-publishing, no external side effects, and no `published` status**.

Two new domain artifacts were added: **`ProfessionalEvidence`** (deterministic, evidence-backed professional content derived from the already-Claude-validated `ProjectAnalysis` + verified repository facts — no second Claude call, so nothing can be fabricated) and **`LinkedInDraft`** (statuses `draft | reviewed | approved | archived`). A new **explicit approval concept** (`approvedForProfessionalUse` + `approvedAt`) was added because none existed — previously unapproved projects could be analyzed directly with no approval gate.

Because there was **no pre-existing LinkedIn write integration**, M15 ends at the approved/ready-to-publish gate and does not fabricate any OAuth/token/API integration, browser automation, or scraping.

---

### 2. Approval Concept (New, Previously Missing)

- **Before M15:** `GitHubRepository` had no concept of "approved for professional use." Any imported repository could be analyzed directly.
- **Added:** `approvedForProfessionalUse` (Boolean, default `false`) and `approvedAt` (Date, nullable) on `GitHubRepository`.
- **Endpoint:** `POST /api/github/repositories/:githubRepositoryId/approve` — body `{ approved: boolean }`. Finds the repo scoped to `{ user: req.user!.id, githubRepositoryId }`, sets the fields (`approvedAt = now` when approving, `null` when revoking), returns a safe partial DTO. If the repo is not the current user's → 404.
- **Effect:** approval is the **gate** for the entire professional-content workflow; revoking approval hides evidence/suggestions on the client.

---

### 3. LinkedIn Integration Status

- **No existing LinkedIn write integration existed in the repo before M15.** This milestone does **not** add one.
- There is **no OAuth to LinkedIn**, **no LinkedIn API response handling**, **no browser automation**, **no scraping**, and **no "published" status**. The `LinkedInDraft` status enum is `draft | reviewed | approved | archived`; `approved` means **Approved — Ready to Publish** and nothing more.
- **No fake/tokened/API responses are fabricated** anywhere. The frontend explicitly states that publishing requires a future official integration and that nothing has been posted externally.

---

### 4. Task Flow Implemented

```
APPROVED GITHUB PROJECT
        │ (explicit `approved=true`, JWT-scoped)
        ▼
CLAUDE PROFESSIONAL ANALYSIS  ← deterministic derivation from existing ProjectAnalysis (no fabrication; no 2nd Claude call)
        ▼
LINKEDIN DRAFT                ← user-driven: generate suggestions, "Use suggestion", or write manually; save as draft
        ▼
HUMAN REVIEW                  ← edit, mark reviewed (draft → approved)
        ▼
READY-TO-PUBLISH              ← status `approved`; workflow STOPS here (nothing external)
```

All state transitions are **user-initiated**; Claude never changes statuses and never creates/persists anything automatically.

---

### 5. Claude Rules Enforced

Claude **may**: analyze only **approved** projects; summarize; suggest positioning; generate LinkedIn post drafts; suggest skills/keywords.

Claude **may NOT**: publish, send email, apply to jobs, change statuses, create follow-ups, modify Gmail, or create any external side effect. **Only explicit user action triggers any assist.** There are **no background workers, cron, or queues.**

**Data integrity rule:** "Use only supplied evidence. Never invent metrics, responsibilities, users, business outcomes, technologies, dates, or achievements." Unavailable evidence is represented as unknown / "insufficient evidence."

- Professional evidence is derived **deterministically** from existing `ProjectAnalysis` + repo facts — no second Claude call — so metrics/responsibilities/business outcomes cannot be fabricated.
- Only Claude's `linkedin-draft/assist` endpoint calls Claude, and its response is strictly validated by Zod before being surfaced; suggestions are **never auto-saved or persisted**.

---

### 6. No Auto-Publishing / No External Side Effects Guarantee

- `LinkedInDraft` has **no `published` status**.
- The assist endpoint **never persists** suggestions; it returns them for the user to review.
- No code path sends to LinkedIn, sends email, applies to jobs, or writes to Gmail.
- No workers/cron/queues were added.
- Review/approve is purely a local status change signaling "Ready to Publish."

---

### 7. Architecture Overview

- Reuses the existing layered pattern: **routes → controller → service → Mongoose model**, plus **middleware** (`authenticate`, `validate`) and **strict Zod validators**, **`AppError`/errorHandler** conventions, and a **safe DTO** to strip sensitive fields.
- Two new routers/services/models, plus additions to the existing GitHub router/controller/model and the Claude service.
- The evidence derivation, draft CRUD, and career metadata all reuse the already-built `ProjectAnalysis` and `GitHubRepository` data — no new external integrations, no duplicate job-matching system.

---

### 8. Models

**`ProfessionalEvidence`** (`server/src/models/ProfessionalEvidence.ts`)
- `user` (ObjectId ref), `githubRepository` (unique ObjectId ref), `sourceProjectAnalysis` (ObjectId ref; nullable)
- `projectName`, `professionalSummary`, `problemSolved`, `contributionEvidence` (string), `technicalSkills`, `architecturePractices`, `measurableImpact` (string), `technologies`, `proposedTalkingPoints`, `suggestedPostAngles` (string[]), `evidenceReferences` (string[]), `roleRelevantKeywords`, `projectDomain`, `senioritySignals`, `status` (`ready | needs_evidence`)
- One evidence per repository (unique index on `githubRepository`).

**`LinkedInDraft`** (`server/src/models/LinkedInDraft.ts`)
- `user` (ObjectId ref), `evidence` (ObjectId ref), `hook`, `body`, `hashtags` (string[]), `status` (`draft | reviewed | approved | archived`)
- Indexes on `{ user, evidence }` and `{ user, status }`.

**`GitHubRepository` (modified)** — added `approvedForProfessionalUse: Boolean default false` and `approvedAt: Date null`.

---

### 9. New / Modified Files (server)

**New**
- `server/src/models/ProfessionalEvidence.ts`
- `server/src/models/LinkedInDraft.ts`
- `server/src/services/professionalEvidence.ts` (derive/get + `toSafeEvidence` DTO)
- `server/src/services/linkedInDraft.ts` (assist/list/get/create/update/approve/archive + `MAX_DRAFTS_PER_EVIDENCE = 50`)
- `server/src/controllers/professionalContent.ts` (evidence generate/get/update; draft list/get/create/update/approve/archive; draft assist)
- `server/src/routes/professionalContent.ts` (drafts router with `validateQuery` for strict query parsing)
- `server/src/validators/professionalContent.ts` (strict Zod: evidence update; draft create/update/approve; list query)
- `server/src/validators/linkedInAssist.ts` (strict Zod output validator: suggestions 1–3 of hook/body/hashtags ≤10)
- `server/src/integrations/claude/linkedinPrompts.ts` (system prompt `LINKEDIN_ASSIST_SYSTEM_PROMPT` + `buildLinkedInAssistUserMessage`)
- `server/tests/professionalContent.test.ts` (26 tests)

**Modified**
- `server/src/models/GitHubRepository.ts` — approval fields
- `server/src/controllers/github.ts` — `setRepositoryApproved`
- `server/src/routes/github.ts` — approve + evidence + assist routes
- `server/src/integrations/claude/claude.service.ts` — `assistLinkedInPost`
- `server/src/app.ts` — mounts the drafts router **before** `/api/projects` (see §11)

---

### 10. New / Modified Files (client)

**New**
- `client/src/pages/ProfessionalContent.tsx` — full M15 workflow UI
- `client/src/types/professionalContent.ts` — shared types

**Modified**
- `client/src/App.tsx` — route `/dashboard/professional-content`
- `client/src/components/DashboardLayout.tsx` — new **Professional Content** nav item

---

### 11. Route Ordering Lesson

The drafts router is registered at `/api/projects/linkedin-drafts` **before** the generic `/api/projects` router. This is required so the existing `GET /:id` project catch-all under `/api/projects` does **not** swallow `linkedin-drafts` and return a 404/"Invalid ObjectId" for what should be a drafts listing. (`server/src/app.ts:65-67`.)

---

### 12. Service Layer — Evidence Derivation (No Fabrication)

`deriveProfessionalEvidence` requires the repository to be **explicitly approved** (else 403 "Repository must be explicitly approved for professional use before it can enter the professional-content workflow"). It then maps **deterministically** from the existing, already-Claude-validated `ProjectAnalysis` and verified `GitHubRepository` fields. Fields with no supplied source are left as empty strings (`measurableImpact`, `contributionEvidence`) — represented as unknown rather than fabricated. `toSafeEvidence` returns only safe fields (strips `user`, `__v`, raw provider documents).

---

### 13. Service Layer — LinkedIn Drafts

- `assistLinkedInSuggestions`: requires an **approved** repo + existing evidence; builds a prompt from evidence + repo facts; calls Claude; **validates output with strict Zod**; returns suggestions without persisting. Malformed suggestions → error, never stored.
- `listDrafts`: user-scoped, bounded (`limit` clamped 1–100), `.populate("evidence","projectName")`, sorted by `updatedAt` desc, returns `{ drafts, total, page, limit }`.
- `createDraft`: requires an approved evidence belonging to the user; rejects if count ≥ 50 per evidence (409-ish bound); starts as `draft`.
- `updateDraft`, `approveDraft`, `archiveDraft`: user-scoped; invalid ObjectId → 404; not found / not owner → 404.
- **Career connection feature (F):** evidence exposes `technicalSkills`, `technologies`, `architecturePractices`, `roleRelevantKeywords`, `projectDomain`, and `senioritySignals` deterministically. No second job-matching system or redesign of the existing matcher was built.

---

### 14. Controllers & Routes

**GitHub router (server):**
- `POST /github/repositories/:id/approve` → `setRepositoryApproved`
- `POST /github/repositories/:id/professional-evidence` → `generateEvidence` (201)
- `GET  /github/repositories/:id/professional-evidence` → `getEvidence` (200/404)
- `PATCH /github/repositories/:id/professional-evidence` → `updateEvidence` (validated)
- `POST /github/repositories/:id/linkedin-draft/assist` → `assistDraft`

**ProfessionalContent router (server) — `/api/projects/linkedin-drafts`:**
- `GET /` (query-validated), `POST /`, `GET /:draftId`, `PATCH /:draftId`, `POST /:draftId/approve`, `POST /:draftId/archive`

All are JWT-authenticated and user-scoped.

---

### 15. Validation Contract (Strict Zod)

- **Bodies:** evidence update, draft create/update/approve validated via `validate`; unknown/extra fields and bad types → **422** `{ error, statusCode, details }`.
- **List query:** `status` must be in `draft|reviewed|approved|archived`; `page` positive integer; `limit` integer 1–100. Out-of-range → **422** (this is the correct, strict bounded behavior; `limit>100` is rejected rather than silently coerced).
- **Assist output:** Zod schema — 1–3 suggestions, each with string `hook`, `body`, and `hashtags` array (each ≤10, `maxLength`, non-empty body). `stableObjectify`/strict parse; malformed → error surfaced, never saved.
- **ObjectId:** invalid draft/evidence ids → **404**, not 500.

---

### 16. Security & Ownership (IDOR Hardening)

- **JWT auth** required on every route; identity always `req.user!.id`.
- **Client-supplied user/owner IDs are never accepted** — no `userId`/`ownerId`/`accountId` params.
- Every query is scoped by `{ user: req.user!.id, ... }`; a resource not owned by the caller → **404**.
- **No leaking:** `toSafeEvidence` strips `user`/`__v`; the approve DTO returns only safe fields; raw provider metadata, tokens, and OAuth data are never returned.
- **Invalid ObjectId → 404** prevents enumeration; **strict Zod** prevents malformed writes (422).
- Evidence/password/token values never logged; no `console.log`/`debugger` in M15 code.

---

### 17. Use Cases Covered by Tests

1. repo must be **explicitly approved** before evidence/assist (unapproved → 403)
2. approve repo (200, approval persisted, DTO safe)
3. revoke approval (200, approvedAt cleared)
4. generate evidence deterministically (201; `user`/`__v` stripped; no fabricated `measurableImpact`/`contributionEvidence`; references include repo URL)
5. cross-user generate → 404
6. cross-user get evidence → 404
7. get evidence not found → 404
8. update evidence fields (200) + validation (422)
9. update evidence cross-user → 404
10. assist requires approved evidence (403/404) and calls Claude; returns validated suggestions
11. malformed Claude output → error, **not auto-saved**
12. create draft requires evidence (403/404); creates as `draft`; bad body → 422
13. max drafts per evidence bound (50) → rejected
14. get draft 200 / 404 cross-user / invalid id 404
15. update draft 200 / cross-user 404
16. approve draft `approved` 200; no `published`
17. archive draft 200
18. list drafts paginated & bounded (`limit≤100`, `limit>100` → 422)
19. cross-user list isolation
20. status filter

---

### 18. Test Results (server)

- **Full suite:** `24` test suites passed, `476` tests passed, `0` failed.
- **M15 suite (`professionalContent.test.ts`):** `26` tests — all pass.
- Command: `cd server && npm test` (runs `jest --forceExit --detectOpenHandles`).
- Earlier in the session, 2 M15 tests were fixed: (a) return evidence through the `toSafeEvidence` DTO (strips `user`/`__v`) and (b) the "list is bounded" test corrected to expect strict 422 for `limit>100` and proper ≤100 cap for valid `limit=100`.

---

### 19. Typecheck Results

- **Server:** `cd server && npx tsc --noEmit` → **`SERVER_TSC_PASS`** (no errors). (Passed after the `string[]` fields typing fix and after the evidence-DTO fix.)
- **Client:** `cd client && npx tsc --noEmit` → **`TSC_DONE`** no errors.

---

### 20. Frontend Build Results

- `cd client && npm run build` (`tsc -b && vite build`) → **success**, `118 modules transformed`, output `dist/assets/index--_jIMLsJ.js` (404.30 kB / gzip 110.28 kB), built in 1.14s. No new dependencies added.

---

### 21. Git Diff / Repo State Verification

- HEAD: `3068e25 feat: add career application analytics and performance intelligence` (unchanged; **M15 is NOT committed**).
- Branch: `main`, upstream `origin/main`; `git log origin/main..HEAD` empty → **HEAD == origin/main**, and the working tree contains M15 **uncommitted** changes.
- `git status --short`: 8 modified tracked files + 12 untracked new files (listed in §9/§10).
- `git diff --stat` (tracked modified): `8 files changed, 153 insertions(+), 1 deletion(-)` among the modified set.
- `git diff --check`: **clean** (no whitespace errors).
- **Nothing committed and nothing pushed** — objective satisfied.

---

### 22. Secret / Debug / Hygiene Scan

- No `console.log` / `console.debug` / `debugger` in any M15 file.
- No real API keys, passwords, or secrets in M15 code. The only grep "hits" are **test fixtures** — `process.env.ANTHROPIC_API_KEY = "test-api-key"` and `process.env.GOOGLE_CLIENT_SECRET = "test-client-secret"` in `tests/professionalContent.test.ts` (test-only env setup, not real credentials, not committed secrets).
- `git diff --check` clean.

---

### 23. Environment Variables / Config Changes

- **No new environment variables required** for M15 at runtime beyond those already required by the existing app (JWT, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `GMAIL_TOKEN_ENCRYPTION_KEY`).
- Tests require the existing suite env vars (via the existing test setup) plus `process.env.ANTHROPIC_API_KEY = "test-api-key"` and `GOOGLE_CLIENT_SECRET` fixture so the Claude client can be constructed — handled in the test file/setup.
- No `.env` files modified or committed.

---

### 24. Features Omitted / Out of Scope (By Design)

- **LinkedIn write/publish integration** — entire publishing path omitted; there is no `published` status, no OAuth to LinkedIn, no API responses, no browser automation, no scraping.
- **Auto-application / POST-apply** — not implemented (unchanged from prior milestones).
- **Gmail writes** — still read-only (unchanged).
- **Background workers / cron / queues / notifications** — none added.
- **Realtime notification of approvals** — not in scope.
- **A second, AI-generated evidence pass** — deliberately avoided to prevent fabrication; evidence is deterministic from existing validated analysis.

---

### 25. Limitations

- Publishing is intentionally a **manual, future** step; M15 ends at "Approved — Ready to Publish."
- Evidence fields like `measurableImpact` and `contributionEvidence` remain empty/unknown unless the user supplies real, verifiable data (no autofill).
- `roleRelevantKeywords`/`senioritySignals` are deterministic hints exposed for future job-matching surface; matching against them is a separate future effort (feature F is only surfaced, not a new matcher).
- Draft list supports status/pagination filters but not a per-evidence server filter; the client groups drafts by the selected evidence.
- Claude assist output is limited to 3 suggestions; generation depends on `ANTHROPIC_API_KEY` availability.

---

### 26. Recommended Next Milestone (#16)

**LinkedIn Publish Integration (official API + human confirmation).** Build on the approved "Ready to Publish" drafts:
1. Add official LinkedIn OAuth + `User Generated Content` API posting for **approved** drafts only (status `approved` must be present; never auto-publish).
2. Add a `published`/`publishedAt`/`postUrl` lifecycle with an explicit **"Publish now"** user action and a confirmation step; keep strict Zod and user-scoping.
3. Optional: turn `roleRelevantKeywords`, `projectDomain`, and `senioritySignals` into a job/skill-surface export (career opportunity feed), without redesigning the existing job matcher.

Recommended order: publish endpoint (with tests) → frontend publish button → career keywords export.

---

### 27. Confirmation: Nothing Committed / Pushed

Confirmed via: `git log --oneline -1` = `3068e25` (pre-M15), `git status --short` shows all M15 changes as **modified/untracked (uncommitted)**, `git log origin/main..HEAD` empty (nothing ahead of upstream), and no `git push` was performed. **No commits created, no pushes made.**

---

### 28. Sign-Off Checklist

- [x] Task flow: Approved → Claude Analysis → LinkedIn Draft → Human Review → **Ready-to-Publish** (stops).
- [x] Explicit approval gate added (`approvedForProfessionalUse`/`approvedAt`) — previously missing.
- [x] No LinkedIn write integration; no `published` status; no fake OAuth/tokens/API; no browser automation/scraping.
- [x] Claude is assist-only; no auto-publish/send/apply/status-change; no background workers.
- [x] Evidence derived deterministically (no fabrication; unknown = empty/insufficient evidence).
- [x] Career metadata (feature F) exposed deterministically; no second job matcher.
- [x] Security: JWT, `req.user!.id`, no client-provided IDs, cross-user 404, invalid ObjectId 404, strict Zod 422, safe DTOs.
- [x] Route ordering: drafts router mounted before `/api/projects` (§11).
- [x] Server `tsc --noEmit` passes.
- [x] Client `tsc --noEmit` passes; `npm run build` passes.
- [x] Server full suite: 24 suites / **476 tests** pass (incl. **26 M15 tests**).
- [x] `git diff --check` clean; secret/debug scan clean (test fixtures only).
- [x] README updated to Milestone 15 (M1–14 preserved); GitHub/API tables updated.
- [x] Nothing committed or pushed.
