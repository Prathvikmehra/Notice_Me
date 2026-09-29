# Notice Me

> A stateful change-monitoring agent tracking critical public updates across government schemes, recruitment notifications, and official proceedings.

---

## What Notice Me Does

Most search engines and chatbots are **stateless** — they answer a question once and immediately forget. Users are left repeatedly re-searching the same queries every few days to check if an exam deadline was postponed, an eligibility threshold was revised, or a recruitment notification was published.

**Notice Me is stateful by design.**
- **Registers Tracked Topics:** Users monitor topics of public interest (e.g., government welfare schemes, entrance exams, judicial hearings).
- **Scheduled Automated Pulls:** Queries SerpApi Google Search and News APIs on a recurring schedule with Gemini AI analysis.
- **Stateful Snapshot Comparison:** Each fresh snapshot is diffed against the previous snapshot to detect material modifications (dates, numbers, criteria, new documents).
- **Redline Change Timeline:** Instead of a wall of repetitive search results, users see a dated, source-linked timeline surfacing only what materially changed.
- **Proactive Alerts:** Delivers email notifications via Nodemailer whenever an actionable update is detected.

---

## Tech Stack

- **Frontend:** React 18, Vite
- **Backend:** Node.js (v20+ ES Modules), Express
- **Database & ORM:** PostgreSQL (Supabase), Prisma ORM
- **Data Source:** SerpApi (Search API + News API) with automated key rotation
- **AI Intelligence:** Gemini AI multi-key rotation pool for briefings and change synthesis
- **Scheduled Jobs:** Integrated node-cron scheduler (T-10m pre-fetch, T-0m dispatch, 3x daily trending radar) and standalone ingestion pipeline (`scripts/pull-and-diff.js`)
- **Email Delivery:** Nodemailer (SMTP)
- **Architecture:** npm workspaces (`backend`, `frontend`)

---

## Project Structure

```
Notice_Me/
├── docs/
│   └── snapshot-format.md           # Snapshot rawData contract specification
├── scripts/
│   ├── pull-and-diff.js             # Pipeline entry point
│   ├── serpapi-client.js            # SerpApi client & key rotation
│   ├── gemini-client.js             # Gemini AI client & key pool rotation
│   └── diff-engine.js               # Temporal diff comparison engine
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            # PostgreSQL schema (User, Topic, Snapshot, Diff)
│   │   └── migrations/              # Database migration history
│   ├── src/
│   │   ├── routes/                  # Express API routes (topics, timeline, user)
│   │   ├── services/                # cronService, topicSyncService, trendingService, alertService, db
│   │   ├── middleware/              # Auth, rate limiting & error handling middleware
│   │   └── index.js                 # Express server entry point
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/              # TopicForm, TopicList, TimelineView, DiffCard, TrendingFeed
│   │   ├── pages/                   # Dashboard, TopicDetail, LoginPage
│   │   ├── contexts/                # AuthContext
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
- **npm** or **pnpm**
- **PostgreSQL / Supabase Database URL**
- **SerpApi API Key(s)**
- **Gemini API Key(s)**

### 2. Install Dependencies
Run from the repository root:
```bash
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` in the root and in `backend/`:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Populate the following variables:
- `DATABASE_URL`: Your Supabase PostgreSQL connection string (pooled or direct).
- `SERPAPI_KEY_1` to `SERPAPI_KEY_5`: SerpApi key pool for automatic key rotation.
- `GEMINI_API_KEYS`: Comma-separated Gemini API keys for AI synthesis and rotation.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: Supabase authentication configuration.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_FROM`: SMTP credentials for email alerts.

### 4. Database Setup & Migrations
Generate the Prisma Client:
```bash
npm run prisma:generate
```

Run database migrations against the Supabase database:
```bash
npm run prisma:migrate
```

---

## Running the Application

### Start Backend Server
From the root directory:
```bash
npm run backend
```
*Starts on `http://127.0.0.1:3000` with automated cron jobs running in the background.*

### Start Frontend Client
From the root directory:
```bash
npm run frontend
```
*Starts on `http://localhost:5173`.*

Open `http://localhost:5173` to manage topics. The frontend reads `VITE_API_URL` (defaults to `http://localhost:3000`); the backend binds to `127.0.0.1` and accepts the local frontend origin by default. Set `FRONTEND_ORIGIN` in the backend environment if you use a different local origin.

The dashboard lets you track custom topics or monitor curated trending notices, view live AI briefings and deadlines, inspect Search and News sources, read dated changes with citations, and configure scheduled email delivery.

### API responses

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /health` | — | `{ "status": "ok" }` |
| `GET /api/topics` | — | `{ "topics": [...] }` |
| `POST /api/topics` | `{ "name": "...", "query": "...", "category": "exam" }` | `201 { "topic": {...} }` |
| `DELETE /api/topics/:id` | — | `204`, deletes that topic and its saved history |
| `GET /api/topics/trending` | — | `{ "trending": [...] }`, curated public radar tracks |
| `GET /api/topics/:id/timeline` | — | `{ "topic": {...}, "diffs": [...] }`, newest first |
| `GET /api/topics/:id/snapshots/latest` | — | `{ "snapshot": {...} }`, or `null` before first pull |
| `POST /api/topics/:id/sync` | — | Trigger on-demand sync with cooldown and concurrency lock |
| `POST /api/topics/:id/alert-settings` | `{ "alertEnabled": true, "alertHour": 14 }` | `{ "topic": {...} }` |

Invalid input returns `400`; missing topics return `404`; unavailable email setup returns `409`; rate limit or cooldown returns `429`.

### Run Ingestion & Diff Pipeline Locally
To manually trigger a data pull and diff run across all tracked topics:
```bash
node scripts/pull-and-diff.js
```

## How the pipeline works

The backend runs an automated scheduler with two-phase pre-fetch (T-10m data gathering + Gemini summary) and instant delivery (T-0m), as well as 3x daily public trending radar refreshes. You can also run the ingestion pipeline directly via `node scripts/pull-and-diff.js`.

For each Topic owned by an authenticated user, the collector requests Google Search (`engine=google`) and Google News (`engine=google_news`). Older seed rows without a `userId` are hidden from the app and excluded from collection and status reports. The collector tries configured `SERPAPI_KEY_1` through `SERPAPI_KEY_5` in order, rotating on HTTP 429 or a quota error. Exhausted keys are skipped for the rest of that run. Logs identify only the key index.

Both responses must contain usable results before any snapshot is written. The collector keeps at most ten results per channel and stores exactly the contract in [`docs/snapshot-format.md`](docs/snapshot-format.md). Google News groups are flattened into articles and publisher objects become publisher names. Missing snippets become empty strings, because Google News may omit them; empty result arrays and malformed articles fail the run.

The previous snapshot is loaded before the new snapshot is inserted. Snapshot creation, comparison through the existing `diff(previous, current)` function, and any Diff insertion share a serializable database transaction. A first snapshot creates no Diff. A diff/database error rolls back that transaction, keeping the baseline intact. Topics completed before a later failure remain stored. Old snapshots are pruned beyond the retention limit (`SNAPSHOT_RETENTION_LIMIT`, default 20) to prevent unbounded storage growth.

For a Topic with `alertEmail` and `alertEnabled: true`, `sendDiffAlert(topic, diff)` sends a source-linked text email through Nodemailer with AI highlights and action recommendations. The Diff is marked `alerted=true` only after SMTP accepts its recipient. Missing SMTP settings fail before collection starts for any email-enabled Topic. Delivery failure leaves the Diff unalerted; subsequent runs retry pending alerts before pulling new data. Enabling alerts through the API is unavailable until SMTP settings are present.

If using Brevo, set `ALERT_FROM` to a verified sender address or an address on an authenticated domain. Brevo's `SMTP_USER` is a technical login and cannot be used as the From address; the collector fails before processing an alert-enabled Topic if it detects that configuration. See [Brevo's SMTP troubleshooting guide](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP). A successful SMTP `250 queued` response is not proof of inbox delivery; inspect Brevo's **Transactional → Logs** for the Delivered, Blocked, Deferred, or Bounce event.

### Validation, quota, and testing

```bash
npm test
```

Tests use mock API/database/SMTP dependencies only inside test files; they require no live credentials.

Each full collection normally makes two SerpApi requests per Topic. At four scheduled runs per day, the 30-day estimate is **240 requests per Topic**, or **720 requests for three Topics / 960 for four Topics**, before manual runs and retries. Each run logs request attempts and successful responses by key index. These counters are not SerpApi billed usage; check each account's SerpApi dashboard for remaining quota.
