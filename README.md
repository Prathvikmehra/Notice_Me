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
- **npm** (or **pnpm**)
- **PostgreSQL / Supabase Database URL**
- **SerpApi API Key(s)**

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