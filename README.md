# Notice Me

> A stateful change-monitoring agent tracking critical public updates across government schemes, recruitment notifications, and official proceedings.

---

## What Notice Me Does

Most search engines and chatbots are **stateless** — they answer a question once and immediately forget. Users are left repeatedly re-searching the same queries every few days to check if an exam deadline was postponed, an eligibility threshold was revised, or a recruitment notification was published.

**Notice Me is stateful by design.**
- **Registers Tracked Topics:** Users monitor topics of public interest (e.g., government welfare schemes, entrance exams, judicial hearings).
- **Scheduled Automated Pulls:** Queries SerpApi Google Search and News APIs on a recurring schedule.
- **Stateful Snapshot Comparison:** Each fresh snapshot is diffed against the previous snapshot to detect material modifications (dates, numbers, criteria, new documents).
- **Redline Change Timeline:** Instead of a wall of repetitive search results, users see a dated, source-linked timeline surfacing only what materially changed.
- **Proactive Alerts:** Delivers email notifications via Nodemailer whenever an actionable update is detected.

---

## Tech Stack

- **Frontend:** React 18, Vite
- **Backend:** Node.js (v20+ ES Modules), Express
- **Database & ORM:** PostgreSQL (Supabase), Prisma ORM
- **Data Source:** SerpApi (Search API + News API) with automated key rotation
- **Scheduled Jobs:** GitHub Actions cron pipeline (`scripts/pull-and-diff.js`)
- **Email Delivery:** Nodemailer (SMTP)
- **Architecture:** npm workspaces (`backend`, `frontend`)

---

## Project Structure

```
Notice_Me/
├── .github/
│   └── workflows/
│       └── pull-and-diff.yml        # GitHub Actions cron workflow
├── docs/
│   └── snapshot-format.md           # Snapshot rawData contract specification
├── scripts/
│   ├── pull-and-diff.js             # Pipeline entry point
│   ├── serpapi-client.js            # SerpApi client & key rotation
│   └── diff-engine.js               # Temporal diff comparison engine
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            # PostgreSQL schema (Topic, Snapshot, Diff)
│   │   └── migrations/              # Database migration history
│   ├── src/
│   │   ├── routes/                  # Express API routes (topics, timeline)
│   │   ├── services/                # diffService, alertService, db
│   │   ├── middleware/              # Error handling middleware
│   │   └── index.js                 # Express server entry point
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/              # TopicForm, TopicList, TimelineView, DiffCard
│   │   ├── pages/                   # Dashboard, TopicDetail
│   │   ├── api/                     # API client wrapper
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
├── .gitignore
├── .env.example
├── package.json                     # Root workspaces configuration
└── README.md
```

---

## Setup & Installation

### 1. Prerequisites
- **Node.js:** v20.x or higher
- **npm** (the Actions pipeline uses the committed root `package-lock.json`)
- **PostgreSQL / Supabase Database URL**
- **SerpApi API Key(s)**

### 2. Install Dependencies
Run from the repository root:
```bash
npm ci
```

### 3. Environment Variables
Copy `.env.example` to `.env` in the root and in `backend/`:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Populate the following variables:
- `DATABASE_URL`: Your Supabase PostgreSQL connection string (pooled or direct).
- `SERPAPI_KEY_1` to `SERPAPI_KEY_4`: SerpApi key pool for automatic key rotation.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_FROM`: SMTP credentials for email alerts.

### 4. Database Setup & Migrations
Generate the Prisma Client:
```bash
npx prisma generate --schema=backend/prisma/schema.prisma
```

Run database migrations against the Supabase database:
```bash
npx prisma migrate dev --schema=backend/prisma/schema.prisma
```
*(Or use `npm run prisma:generate` and `npm run prisma:migrate` from the root)*

---

## Running the Application

### Start Backend Server
From the root directory:
```bash
npm run backend
```
*Or navigate to `backend/` and run `npm run dev` (starts on `http://localhost:3000`).*

### Start Frontend Client
From the root directory:
```bash
npm run frontend
```
*Or navigate to `frontend/` and run `npm run dev` (starts on `http://localhost:5173`).*

### Run Ingestion & Diff Pipeline Locally
To manually trigger a data pull and diff run without waiting for the cron job:
```bash
node scripts/pull-and-diff.js
```

## How the pipeline works

Every six hours (`0 */6 * * *`, UTC), GitHub Actions runs the same script as the local command above. Node 20 installs the locked npm workspace dependencies, generates Prisma Client, and runs the automated tests before collection. Existing pnpm lockfiles are retained; the workflow uses the npm lockfile. Update `package-lock.json` whenever workspace dependencies change.

For each database Topic, the collector requests Google Search (`engine=google`) and Google News (`engine=google_news`). It tries configured `SERPAPI_KEY_1` through `SERPAPI_KEY_4` in order, rotating on HTTP 429 or a quota error. Exhausted keys are skipped for the rest of that run. Logs identify only the key index.

Both responses must contain usable results before any snapshot is written. The collector keeps at most ten results per channel and stores exactly the contract in [`docs/snapshot-format.md`](docs/snapshot-format.md). Google News groups are flattened into articles and publisher objects become publisher names. Missing snippets become empty strings, because Google News may omit them; empty result arrays and malformed articles fail the run.

The previous snapshot is loaded before the new snapshot is inserted. Snapshot creation, comparison through the existing `diff(previous, current)` function, and any Diff insertion share a serializable database transaction. A first snapshot creates no Diff. A diff/database error rolls back that transaction, keeping the baseline intact. Topics completed before a later failure remain stored.

For a Topic with `alertEmail`, the integration contract is `sendDiffAlert(topic, diff)`: the service must reject on delivery failure. The Diff is marked `alerted=true` only after delivery resolves successfully; an explicit `false` also counts as failure. Until that export exists in `backend/src/services/alertService.js`, a run with any email-enabled Topic fails before collection. Alert failures leave the stored Diff unalerted and fail the run. Automatic retry of previously unalerted Diffs is not implemented; inspect and coordinate any resend with the alert-service owner.

### First live run

1. In GitHub repository **Settings → Secrets and variables → Actions**, set `DATABASE_URL` and the available `SERPAPI_KEY_1`–`SERPAPI_KEY_4`. At least one key is required. Email delivery additionally needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `ALERT_FROM`.
2. Confirm the existing Prisma migrations have been applied to the shared database with its owner. The collection workflow does not change the database schema.
3. Open **Actions → Scheduled Pull and Diff → Run workflow** on `main`. Enable **seed_topics** only when the initial tracked topics need adding. This invokes the existing seed script, which preserves topics already present.
4. Open the run summary to see snapshot/diff counts and latest pull timestamps. Download the `pipeline-status-<run-id>` artifact for the latest diff summaries and source URLs. These are database observations, not fabricated fixtures.
5. Check a subsequent run with event **schedule**, rather than assuming a successful manual run proves the cron fired. Scheduled start times can be delayed by GitHub.

Concurrent manual and scheduled runs are serialized. A red run is a collection gap: inspect the failed step before rerunning. Zero tracked topics produces no snapshots; use the count report to catch that setup problem.

If Actions reports `Can't reach database server` for a direct Supabase hostname, check its IP support. Direct endpoints normally require IPv6; use **Supabase → Connect → Session pooler** for an IPv4 connection. Copy the exact pooler host, port, and username from that dialog into the GitHub `DATABASE_URL` secret, replacing the password placeholder with the percent-encoded database password. Do not guess the pooler host from the region. This only changes the workflow secret; teammates can retain their working local connections. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

### Validation, quota, and demo evidence

```bash
npm test
npm run pipeline:status
```

Tests use mock API/database/SMTP dependencies only inside test files; they require no live credentials. The status command reads the database without changing it. GitHub Actions runs both automatically and retains its JSON evidence artifact for 14 days.

Each full collection normally makes two SerpApi requests per Topic. At four scheduled runs per day, the 30-day estimate is **240 requests per Topic**, or **720 requests for three Topics**, before manual runs and retries. Each run logs request attempts and successful responses by key index. These counters are not SerpApi billed usage; check each account's SerpApi dashboard for remaining quota.

Check Actions daily. Before the demo, verify at least **three snapshots per tracked Topic and three real Diffs overall** (the PRD's stricter target). Review the actual changes and source URLs: a count alone cannot establish that a change is meaningful. Repeated pulls may legitimately produce no Diffs; never edit stored snapshots or manufacture updates to meet the target. Once the alert service and SMTP secrets are ready, verify a real delivery and confirm that only the delivered Diff is marked alerted.
