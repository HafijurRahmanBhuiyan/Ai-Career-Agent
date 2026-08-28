# n8n Scheduled Job Ingestion

This workbook periodically triggers the AI Career Agent's **real job-source
discovery** pipeline (`POST /api/jobs/discover`) so the opportunity feed and
notification center stay fresh without any manual action.

## Overview

The bundled workflow (`n8n/workflows/job-ingestion-workflow.json`) contains two
nodes:

1. **Every 6 hours** — a Schedule Trigger that fires on a cron interval.
2. **Trigger job discovery** — an HTTP Request node that POSTs a discover
   payload to the server.

The server's discovery endpoint calls every **configured** job source
(`mock`, `adzuna`, `arbeitnow`, `remoteok`), normalizes + de-duplicates the
results, and writes them into the `jobs` collection through the same pipeline
the opportunity feed reads. Sources that are not configured (e.g. Adzuna
without keys) are skipped gracefully and reported with `status: "error"`.

> **No LinkedIn** in this workflow. LinkedIn publishing is a separate,
> human-approved flow. This workflow only fetches job listings.

## What it calls

- **Method:** `POST`
- **URL:** `http://localhost:5001/api/jobs/discover`
- **Auth:** HTTP Header Auth credential carrying `Authorization: Bearer <JWT>`

### Request body (edit to taste)

```json
{
  "roles": ["Software Engineer", "Full Stack Developer"],
  "locations": [],
  "remote": "any",
  "experienceLevel": "mid",
  "salaryMinimum": 60000,
  "limit": 20,
  "page": 1
}
```

These fields map directly to the server's `jobDiscoverRequestSchema`. Leave
`locations` empty to match remote-friendly roles, or populate it to target
specific cities.

## Setup

1. **Make sure the server is running** with `npm run dev` in `server/`.

2. **Configure the job sources** in `server/.env` (see `server/.env.example`):
   - `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — required for Adzuna (optional).
   - Arbeitnow and RemoteOK need no keys and are always enabled.
   - The `mock` source is always available for local development.

3. **Start n8n** and create an **HTTP Header Auth** credential:
   - Header name: `Authorization`
   - Header value: `Bearer <your JWT>`

   Obtain a JWT by signing in through the app or calling
   `POST /api/auth/login`, and paste the returned token as the header value.

4. **Import the workflow**:
   - In n8n, go to *Workflows → Import from File*.
   - Select `n8n/workflows/job-ingestion-workflow.json`.

5. **Connect the credential** to the *Trigger job discovery* node:
   - Open the node → *Credential for Header Auth* → select the HTTP Header Auth
     credential you created.
   - Optionally change the `URL` and `JSON Body` to match your deployment
     (host, roles, remote preference, etc.).

6. **Activate** the workflow by toggling it active. It will run every 6 hours.

## Manual run / testing

With the workflow open, use n8n's **Execute workflow** (or *Execute node*) to
run it once. The node will return the server JSON:

```json
{
  "jobs": [ ... ],
  "count": 12,
  "sources": [
    { "source": "mock", "status": "success", "count": 6 },
    { "source": "adzuna", "status": "error", "message": "Adzuna is not configured..." },
    { "source": "arbeitnow", "status": "success", "count": 4 },
    { "source": "remoteok", "status": "success", "count": 2 }
  ]
}
```

`status: "error"` entries are expected for unconfigured sources and prove the
pipeline degrades gracefully.

## Troubleshooting

- **401 Unauthorized** — the Bearer token is missing/expired. Refresh the JWT
  and update the credential.
- **429 Too Many Requests** — the discovery endpoint is rate-limited
  (20 requests per 15 minutes). Wait and rerun.
- **No new jobs** — the discoverer de-duplicates against existing jobs, so a
  repeat run may surface few/no new records; that is expected and correct.
