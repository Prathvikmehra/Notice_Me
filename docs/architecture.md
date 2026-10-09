# Notice Me — Architecture & System Design

## 1. System Overview

Notice Me is a stateful change-monitoring agent designed to track critical regulatory circulars, government welfare schemes, recruitment notices, and judicial proceedings across India.

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Client (React 18 + Vite)"]
        UI["Dashboard & Topic Detail View"]
        AIChat["AI Analyst Copilot Modal"]
        Trends["Live Trending Radar View"]
        Digest["Recent Changes Activity Digest"]
    end

    subgraph APILayer["Backend Gateway (Express.js on Node 20 ESM)"]
        AuthMid["Auth Middleware (Supabase JWT Cache)"]
        TopicsRoute["Topics Router (CRUD, Sync, Alerts)"]
        ChatRoute["Chat Router (Grounded Context Synthesis)"]
        TrendingRoute["Trending Router (30s In-Memory Cache)"]
        UserRoute["User Router (Profiles & Pro Plan)"]
    end

    subgraph ServiceLayer["Core Services & Engines"]
        DiffEngine["Diff Engine (URL Identity & Churn Guard)"]
        SyncService["Topic Sync Service (Locking & Pruning)"]
        CronService["Cron Scheduler (Two-Phase Ingestion)"]
        TrendingService["Trending Service (Google Trends Puller)"]
        AlertService["Alert Service (HTML/Text Formatter)"]
    end

    subgraph InfrastructureLayer["Data & External Providers"]
        DB[("Supabase PostgreSQL (Prisma ORM)")]
        SerpPool["SerpApi Pool (5 Keys with Quota Failover)"]
        GeminiPool["Gemini Pool (Flash Model with Cooldown)"]
        SMTPGateway["Nodemailer Gateway (Brevo SMTP)"]
    end

    ClientLayer <-->|HTTPS REST API / Bearer Token| APILayer
    APILayer --> ServiceLayer
    ServiceLayer <-->|Prisma Client| DB
    ServiceLayer <-->|Search & News Requests| SerpPool
    ServiceLayer <-->|AI Briefings & Diffs| GeminiPool
    ServiceLayer -->|Delivers Email Notifications| SMTPGateway
```

---

## 2. Ingestion & Diffing Sequence Flow

This sequence diagram illustrates the lifecycle of a single topic pull, whether triggered automatically by the background cron scheduler or manually by the user:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Cron Scheduler
    participant Sync as TopicSyncService
    participant DB as PostgreSQL (Prisma)
    participant Serp as SerpApiClient
    participant DiffEng as DiffEngine
    participant AI as GeminiClient
    participant SMTP as AlertService (Nodemailer)

    User->>Sync: syncTopic(topicId)
    Sync->>DB: Check active lock & fetch Topic
    Sync->>Serp: pullSnapshot(topic.query)
    Serp-->>Sync: Return rawData (Search + News results)
    
    Sync->>DB: snapshot.findFirst(latest previous)
    DB-->>Sync: Return previous snapshot (or null)

    alt Previous is null (Baseline Snapshot)
        Sync->>AI: generateBriefing(topic, rawData)
        AI-->>Sync: aiBriefing JSON
        Sync->>DB: Insert Baseline Snapshot (alerted=false, diff=null)
    else Previous exists
        Sync->>DiffEng: diff(previous, current)
        DiffEng-->>Sync: Return diffResult { summary, sourceUrls } or null
        
        alt diffResult is null (No Changes Detected)
            Note over Sync,AI: Zero Gemini API Tokens Spent
            Sync->>Sync: Reuse previous.rawData.aiBriefing
            Sync->>DB: Insert Snapshot (diff=null)
        else Material Changes Found
            Sync->>AI: generateBriefing(topic, rawData)
            AI-->>Sync: Fresh aiBriefing JSON
            Sync->>AI: generateStructuredDiff(topic, delta)
            AI-->>Sync: StructuredDiff { headline, before, after, impact, evidence }
            
            critical Atomic DB Transaction
                Sync->>DB: Insert Snapshot
                Sync->>DB: Insert Diff (alerted=false)
                Sync->>DB: Prune excess Snapshots & Diffs (> retention limit)
            end
            
            opt If topic.alertEnabled && topic.alertEmail
                Sync->>SMTP: sendDiffAlert(topic, diff)
                SMTP-->>Sync: SMTP 250 Accepted
                Sync->>DB: diff.update(alerted=true), topic.update(lastAlertedAt)
            end
        end
    end
    Sync-->>User: Complete (topic, snapshot, diff, isBaseline)
```

---

## 3. Topic & Snapshot Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Created: User registers topic (or NL intent)
    
    Created --> Syncing: Initial sync initiated
    Syncing --> BaselineCaptured: First pull succeeds (Baseline Snapshot)
    
    BaselineCaptured --> Idle: Waiting for next schedule / manual sync
    Idle --> Syncing: Minute 50 Pre-fetch / Manual Sync triggered
    
    Syncing --> Unchanged: diff == null
    Unchanged --> Idle: Preserves previous briefing (zero tokens)
    
    Syncing --> Changed: diff != null
    Changed --> StructuredSynthesis: Gemini generates before/after and impact
    StructuredSynthesis --> AlertPending: Diff stored (alerted=false)
    
    AlertPending --> AlertDelivered: SMTP accepted & delivered
    AlertPending --> DeliveryFailed: SMTP rejected (stays unalerted for retry)
    
    AlertDelivered --> Idle: Timestamp marked in lastAlertedAt
    DeliveryFailed --> Idle: Logged - retry on next run
    
    Idle --> Deleted: User deletes topic
    Deleted --> [*]: Cascade deletes snapshots & diffs
```

---

## 4. Two-Phase Cron Architecture

Notice Me splits scheduled alert operations into two discrete phases to prevent alert delay and network congestion:

```mermaid
flowchart LR
    subgraph TMinus10["Phase 1: Pre-fetch (Minute 50)"]
        P1["Cron tick: 50 * * * *"] --> P2["Filter topics due in upcoming hour"]
        P2 --> P3["Concurrent SerpApi Ingestion"]
        P3 --> P4["Gemini Diff & Briefing Synthesis"]
        P4 --> P5["Save Diff with alerted=false"]
    end

    subgraph TZero["Phase 2: Instant Dispatch (Minute 0)"]
        D1["Cron tick: 0 * * * *"] --> D2["Filter topics scheduled for current hour"]
        D2 --> D3{"Pending unalerted diff?"}
        D3 -->|Yes| D4["Immediate Nodemailer SMTP Send"]
        D3 -->|No - Fresh pull ran| D5["Update lastAlertedAt"]
        D3 -->|Missed Pre-fetch| D6["Fallback On-Demand Sync"]
    end

    TMinus10 -.->|10-minute lead time| TZero
```

---

## 5. Multi-Key Rotation Pools & Quota Recovery

### SerpApi Client (`scripts/serpapi-client.js`)
- Circular rotation over `SERPAPI_KEY_1` through `SERPAPI_KEY_5`.
- Intercepts HTTP 429 and rate-limit responses.
- Channels (Search vs News) retain successful key offsets to avoid thrashing.
- Redacts key secrets in logs (reports only key pool index).

### Gemini AI Client (`scripts/gemini-client.js`)
- Circular pool rotation over `GEMINI_API_KEYS` and `GEMINI_API_KEY_1..10`.
- Applies a **60-second cooldown** to exhausted keys before re-attempting.
- Offline rule-based fallbacks guarantee functionality even during total API quota outages.

---

## 6. Token & Performance Optimization Matrix

| Mechanism | Architecture | Resource Impact |
| --- | --- | --- |
| **Zero-Diff Briefing Reuse** | In `topicSyncService.js`, diff comparison executes *prior* to Gemini calls. Identical snapshots inherit previous briefing. | **~95% reduction** in Gemini API calls during cron cycles. |
| **Compact JSON Templates** | Stripped `null, 2` pretty-printing across all prompt definitions. | **~35% input token reduction** on every LLM call. |
| **Bounded Output Caps** | Bounded `maxOutputTokens` (600 for briefings, 750 for diffs, 1000 for chat). | Prevents run-away generation latency and quota consumption. |
| **Topic-Scoped Chat Context** | In `/api/topics/chat`, context filters strictly to target topic, limiting snapshots to top 3 and truncating snippets. | Shrinks chat prompt payload from **~12,000 to ~1,200 tokens**. |
| **Frontend Code Splitting** | Vite manual chunks (`vendor`, `supabase`) and `React.lazy` on pages and modals. | Initial JavaScript entry payload reduced from **519 kB to 4.87 kB**. |
| **In-Memory Follower Cache** | 30s cache with `Cache-Control: public, max-age=15` on `/api/topics/trending`. | Eliminates redundant database reads on the public trending feed. |

---

## 7. Database Entity Relationship (ER) Model

```mermaid
erDiagram
    USER ||--o{ TOPIC : owns
    TOPIC ||--o{ SNAPSHOT : records
    TOPIC ||--o{ DIFF : generates

    USER {
        string id PK "UUID"
        string email "Unique user email"
        string name "Display name"
        string plan "Subscription tier: 'free' | 'pro'"
        datetime createdAt "User creation timestamp"
    }

    TOPIC {
        string id PK "UUID"
        string userId FK "References User.id"
        string name "Topic title (e.g. UPSC CSE 2026)"
        string query "Search query string"
        string category "scheme | exam | recruitment | case | policy | other"
        string alertEmail "Recipient email address"
        boolean alertEnabled "Alert delivery active flag"
        int alertHour "Scheduled delivery hour (0-23)"
        string alertDays "weekdays | all | mon-sun | 1-30"
        string alertFrequency "1h | 3h | 1d | weekly | monthly"
        string timezone "IANA timezone identifier"
        datetime lastAlertedAt "Timestamp of most recent alert"
        datetime createdAt "Creation timestamp"
    }

    SNAPSHOT {
        string id PK "UUID"
        string topicId FK "References Topic.id"
        json rawData "Search results, news articles, aiBriefing"
        datetime pulledAt "Ingestion timestamp"
        datetime createdAt "Record creation timestamp"
    }

    DIFF {
        string id PK "UUID"
        string topicId FK "References Topic.id"
        string summary "Structured diff JSON or plain text"
        string_array sourceUrls "Verified URLs supporting this change"
        boolean alerted "Email delivery confirmation flag"
        datetime detectedAt "Change detection timestamp"
    }
```

### Data Retention & Cleanup Policies
- **Snapshot Retention Limit:** Configured via `SNAPSHOT_RETENTION_LIMIT` (default: 20 per topic). Excess rows are automatically pruned inside the atomic write transaction.
- **Diff Retention Limit:** Configured via `DIFF_RETENTION_LIMIT` (default: 50 per topic). Excess rows are pruned to prevent database bloat.
- **User Cascade Deletion:** When a Topic is deleted, all associated Snapshots and Diffs are deleted within a serializable transaction.
