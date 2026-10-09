# Notice Me

> A stateful change-monitoring agent tracking critical public updates across government schemes, entrance exams, recruitment notifications, and judicial proceedings in India.

[![Tests](https://img.shields.io/badge/tests-53%20passing-brightgreen.svg)](#testing--verification)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)](https://nodejs.org/)
[![Package Manager](https://img.shields.io/badge/pnpm-9.x-orange.svg)](https://pnpm.io/)
[![Frontend](https://img.shields.io/badge/react-18.3-61dafb.svg)](https://react.dev/)
[![Database](https://img.shields.io/badge/postgresql-supabase-3ecf8e.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## What Notice Me Does

Most search engines and chatbots are **stateless** — they answer a question once and immediately forget. Users are left repeatedly re-searching the same queries every few days to check if an exam deadline was postponed, an eligibility threshold was revised, or an admit card link went live.

**Notice Me is stateful by design:**
- **Persistent Monitors:** Users register queries once (e.g., `"UPSC CSE 2026 prelims"`, `"PM-KISAN eligibility"`) via forms or natural language intent.
- **Automated Collection:** Queries SerpApi Google Search and Google News on customizable schedules (hourly, 3h, daily, weekdays, monthly) with automatic key pool rotation.
- **Stateful Snapshot Comparison:** Each fresh snapshot is diffed against the previous snapshot to detect material modifications (dates, numbers, criteria, new documents) while suppressing rank jitter.
- **Structured AI Diff Synthesis:** Gemini synthesizes clear Before/After comparisons, Impact level (`HIGH`, `MEDIUM`, `LOW`), practical significance ("Why It Matters"), affected stakeholders, and verified evidence URLs.
- **AI Intelligence Analyst:** A conversational copilot grounded strictly in user's monitored snapshots, historical diffs, and official citations with zero hallucinations.
- **Live Trending Radar:** Tracks Google Trends across India via SerpApi to discover breaking public notices and add them to watchlist with 1 click.
- **Proactive Alerts:** Delivers rich HTML and text email alerts via Nodemailer whenever an actionable update is detected.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Vite + React 18)"]
        UI["Dashboard & Watchlist"]
        AIChat["AI Analyst Copilot"]
        TrendingUI["Live Trending Radar"]
        DigestUI["Recent Changes Digest"]
    end

    subgraph API["Backend Gateway (Express.js on Node 20 ESM)"]
        AuthMiddleware["Supabase JWT Auth & User Cache"]
        TopicsRouter["/api/topics (CRUD & Sync)"]
        ChatRouter["/api/topics/chat (Grounded QA)"]
        TrendsRouter["/api/topics/trending (Cached Radar)"]
        UserRouter["/api/user (Profile & Tier)"]
    end

    subgraph Cron["Background Automation Daemon"]
        Ticker["Minute Ticker (* * * * *)"]
        Prefetch["T-10m Pre-fetch (50 * * * *)"]
        Dispatch["T-0m Instant Dispatch (0 * * * *)"]
        TrendWarm["Trending Pre-warm (45 7,13,19 * * *)"]
    end

    subgraph External["External Integrations"]
        SerpApi["SerpApi (Search, News, Google Trends)"]
        Gemini["Gemini AI (Briefings, Diffs, Chat)"]
        DB[(Supabase PostgreSQL / Prisma)]
        SMTP["Nodemailer (Brevo SMTP Gateway)"]
    end

    Client <-->|REST API + Bearer JWT| API
    API <-->|Prisma ORM| DB
    API <-->|Multi-key Rotation| SerpApi
    API <-->|Flash Key Pool| Gemini
    Cron -->|Orchestrates| API
    Cron -->|Sends Alerts| SMTP
```

---

## Data Ingestion & Diff Pipeline

```mermaid
flowchart LR
    A["Scheduled Run / Manual Sync"] --> B["SerpApi Pull (Search + News)"]
    B --> C{"Previous Snapshot Exists?"}
    
    C -->|No: Baseline| D["Generate Initial AI Briefing"]
    D --> E["Persist Baseline Snapshot"]
    
    C -->|Yes| F["Run diff(previous, current)"]
    F --> G{"Material Delta Found?"}
    
    G -->|No Change| H["Reuse previous.aiBriefing"]
    H --> I["Persist Snapshot (Zero AI tokens spent)"]
    
    G -->|Changes Found| J["Generate Fresh Briefing"]
    J --> K["Generate Structured Diff via Gemini"]
    K --> L["Atomic Write (Snapshot + Diff)"]
    L --> M["Prune Excess History (> retention)"]
    M --> N["Dispatch Source-Linked Email Alert"]
```

---

## Key Features

### 1. Grounded AI Intelligence Analyst
- Chat assistant operating strictly on stored snapshots, diffs, and citations.
- Selectively switches scope between **All Monitored Topics** or a specific notice.
- Formats comparisons (`Previous State` vs `Verified Update`), key milestones, and verified source chips.
- Interactive follow-up suggestion pills for 1-click inquiry progression.

### 2. Natural Language Monitor Extraction
- Users can type natural prompts like *"Watch GATE 2027 for exam dates and eligibility changes"*.
- Gemini extracts the clean title (`GATE 2027`), optimized query without boolean noise, relevant category (`exam`), and target source portals.

### 3. Live Trending Public Radar
- Live discovery powered by SerpApi Google Trends India (`geo=IN`).
- Automatically categorizes surges (e.g. `Jobs and Education`, `Law and Government`, `Business and Finance`).
- Enriched with follower counts and pre-warmed AI briefings 3 times daily.

### 4. Deterministic Diff Engine with Noise Guards
- Compares items by unique destination URL (`link`).
- Ignores rank position shuffling.
- **Boundary Churn Guard:** Suppresses false-positive swaps at position 10/11 caused by search engine algorithmic jitter.
- **Displaced Tail Removal Guard:** Prevents displacing a lower result from incorrectly triggering a removal alert when higher items are inserted.

---

## Token & Performance Optimizations

| Optimization | Implementation | Impact |
| --- | --- | --- |
| **Zero-Diff Briefing Reuse** | In `topicSyncService.js`, snapshot diff runs *before* AI briefings. If results are identical, reuses previous briefing. | Eliminates **~95%** redundant Gemini calls on routine cron runs. |
| **Compact JSON Prompts** | Stripped `null, 2` indentation across all Gemini prompt templates. | **~35% token reduction** across all LLM queries. |
| **Capped Output Limits** | Bounded `maxOutputTokens` (600 for briefings, 750 for diffs, 1000 for chat). | Eliminates runaway token generation and latency. |
| **Scoped Chat Context** | Filters context strictly to active topic, slices top 3 search/news items, truncates snippets to 120 chars. | Context payload shrunk from **~12,000 to ~1,200 tokens**. |
| **Code-Split Frontend Bundles** | Vite manual chunks (`vendor`, `supabase`) and `React.lazy` on pages and modals. | Main entry chunk dropped from **519 kB to 4.87 kB**. |
| **In-Memory Follower Cache** | 30s cache with `Cache-Control: public, max-age=15` on `/api/topics/trending`. | Eliminates repeat database queries on the trending feed. |

---

## Tech Stack

- **Frontend:** React 18, Vite (Neo-Brutalist design language with dark/light mode toggle)
- **Backend:** Node.js (v20+ ES Modules), Express
- **Database & ORM:** PostgreSQL (Supabase), Prisma ORM
- **Search Provider:** SerpApi (Search, News, Trending Now) with multi-key pool rotation
- **AI Models:** Gemini API (`gemini-3.5-flash`) with circular key failover and cooldown
- **Cron Engine:** `node-cron` with two-phase pre-fetch and dispatch architecture
- **Email Delivery:** Nodemailer (SMTP / Brevo transactional integration)
- **Package Manager:** `pnpm` workspaces (`backend`, `frontend`)

---

## Setup & Quickstart

### 1. Prerequisites
- **Node.js:** v20.x or higher
- **pnpm:** v9.x or higher (`npm install -g pnpm`)
- **PostgreSQL Database URL** (e.g., Supabase)
- **SerpApi API Key(s)**
- **Gemini API Key(s)**

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure the following:
```ini
DATABASE_URL="postgresql://postgres.xxx:pass@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
SERPAPI_KEY_1="your_serpapi_key_1"
SERPAPI_KEY_2="your_serpapi_key_2"
GEMINI_API_KEYS="your_gemini_key_1,your_gemini_key_2"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT=587
SMTP_USER="your-login@smtp-brevo.com"
SMTP_PASS="your-smtp-master-key"
ALERT_FROM="Notice Me <alerts@yourdomain.com>"
```

### 4. Database Setup & Migrations
```bash
pnpm prisma:generate
pnpm prisma:migrate
```

### 5. Running Locally

Start the backend (Express API + Cron Scheduler):
```bash
pnpm backend
```
*Runs on `http://127.0.0.1:3000`.*

Start the frontend:
```bash
pnpm frontend
```
*Runs on `http://localhost:5173`.*

---

## API Summary

| Endpoint | Method | Description | Access |
| --- | --- | --- | --- |
| `/health` | `GET` | Health status, uptime, and scheduler heartbeat | Public |
| `/api/topics/trending` | `GET` | Curated and dynamic Google Trends radar | Public (Cached) |
| `/api/topics` | `GET`, `POST` | List and create monitored topics | Authenticated |
| `/api/topics/item/:id` | `GET` | Retrieve single topic details | Authenticated |
| `/api/topics/:id` | `DELETE` | Cascade delete topic and history | Authenticated |
| `/api/topics/:id/sync` | `POST` | Trigger on-demand sync with cooldown | Authenticated |
| `/api/topics/:id/alert-settings` | `POST` | Update notification schedule and email | Authenticated |
| `/api/topics/:id/timeline` | `GET` | Chronological dated diff history | Authenticated |
| `/api/topics/:id/snapshots/latest` | `GET` | Most recent snapshot & AI briefing | Authenticated |
| `/api/topics/recent-changes` | `GET` | Cross-topic watchlist activity feed | Authenticated |
| `/api/topics/parse-intent` | `POST` | Natural language monitor generator | Authenticated |
| `/api/topics/chat` | `POST` | Grounded AI Analyst chat assistant | Authenticated |
| `/api/user/me` | `GET`, `PATCH` | User profile and plan details | Authenticated |
| `/api/user/upgrade` | `POST` | Upgrade / downgrade tier (Free/Pro) | Authenticated |

*Full documentation available in [`docs/api-reference.md`](docs/api-reference.md).*

---

## Testing & Verification

Run all unit and integration tests:
```bash
pnpm test
```

All **53 tests** execute natively via Node's test runner in under 2 seconds:
- `diff-engine.test.js`: URL-based diffing, rank jitter suppression, snippet modifications, boundary churn.
- `diff-service.test.js`: Timeline sorting and pagination.
- `gemini-client.test.js`: Key pool rotation, 429 quota recovery, fallback diff synthesis.
- `pipeline.test.js`: Snapshot bounds, multi-key SerpApi failover, transaction rollbacks, retention limits.
- `product.test.js`: Express routes, validation, and SMTP alert dispatch.
- `auth-and-expansion.test.js`: Free-tier quota (max 5 topics), session caching, two-phase scheduler.
- `audit-fixes.test.js`: Urgency extraction, intent parsing, grounded chat, confirmation emails.
- `optimization-audit.test.js`: Unified impact classifier, zero-diff briefing reuse, trending cache.

Verify production frontend build:
```bash
pnpm --filter frontend build
```

---

## Documentation Index

- **[`docs/architecture.md`](docs/architecture.md)** — System architecture, sequence diagrams, lifecycle states, ER model.
- **[`docs/api-reference.md`](docs/api-reference.md)** — Complete REST API reference with schemas and examples.
- **[`docs/diff-rules.md`](docs/diff-rules.md)** — Diff engine rules, noise suppression, and structured AI schemas.
- **[`docs/snapshot-format.md`](docs/snapshot-format.md)** — Snapshot raw data specification and contracts.
- **[`docs/deployment.md`](docs/deployment.md)** — Production deployment guide (Supabase, Render, Vercel, Brevo).
