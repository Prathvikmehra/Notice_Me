# Notice Me — Production Deployment Guide

This guide covers deploying Notice Me across cloud infrastructure (Supabase PostgreSQL, Render/Railway Backend, Vercel/Netlify Frontend, Brevo SMTP).

---

## Deployment Architecture Topology

```mermaid
flowchart LR
    subgraph CDN["Edge & Frontend (Vercel / Netlify)"]
        SPA["React 18 SPA (Vite Production Build)"]
    end

    subgraph Compute["Backend Compute (Render / Railway / VPS)"]
        API["Express.js Server (Port 3000)"]
        CronDaemon["node-cron Scheduler (In-Process)"]
    end

    subgraph Managed["Managed Cloud Services"]
        SupabaseDB[("Supabase PostgreSQL (Session Pooler)")]
        SerpCloud["SerpApi Cluster"]
        GeminiCloud["Google Gemini AI"]
        BrevoSMTP["Brevo SMTP Gateway"]
    end

    CDN <-->|HTTPS API Calls / Bearer JWT| Compute
    Compute <-->|Prisma Transaction Pool| SupabaseDB
    Compute <-->|Search & News Queries| SerpCloud
    Compute <-->|AI Synthesis & Embeddings| GeminiCloud
    Compute -->|Transactional Alerts| BrevoSMTP
```

---

## 1. Environment Variables Checklist

Configure these variables in your hosting provider's dashboard:

### Database & Authentication
| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Transaction/Session pooled) | `postgresql://postgres.xxx:pass@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `SUPABASE_URL` | Supabase project URL | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY`| Supabase public anon key | `eyJhbGciOi...` |

### Search & Ingestion (SerpApi)
| Variable | Description | Example |
| --- | --- | --- |
| `SERPAPI_KEY_1` | Primary SerpApi key | `serp_api_key_alpha` |
| `SERPAPI_KEY_2`..`5` | Secondary keys for quota failover | `serp_api_key_beta` |

### Artificial Intelligence (Gemini)
| Variable | Description | Example |
| --- | --- | --- |
| `GEMINI_API_KEYS` | Comma-separated Gemini API keys | `key1,key2,key3` |
| `GEMINI_MODEL` | Optional model override (defaults to `gemini-3.5-flash`) | `gemini-3.5-flash` |

### Transactional Alerts (SMTP / Brevo)
| Variable | Description | Example |
| --- | --- | --- |
| `SMTP_HOST` | SMTP server host | `smtp-relay.brevo.com` |
| `SMTP_PORT` | SMTP port (`587` for STARTTLS, `465` for SSL) | `587` |
| `SMTP_USER` | SMTP username/login | `7fxxxx@smtp-brevo.com` |
| `SMTP_PASS` | SMTP password / API master key | `xsmtpsib-...` |
| `ALERT_FROM` | Verified sender email address | `Notice Me <alerts@yourdomain.com>` |

### Origins & Routing
| Variable | Description | Example |
| --- | --- | --- |
| `PORT` | Backend port (auto-assigned by host) | `3000` |
| `FRONTEND_ORIGIN`| Allowed CORS origins (comma-separated) | `https://noticeme.vercel.app` |
| `FRONTEND_URL` | Web application URL embedded in alert email CTA buttons | `https://noticeme.vercel.app` |

---

## 2. Database Setup (Supabase)

1. Create a project on [Supabase](https://supabase.com).
2. Retrieve the **Connection Pooling (Session)** string under **Project Settings → Database → Connection string**.
3. Run migrations from the repository root:
   ```bash
   pnpm prisma:migrate
   ```
4. Verify table schemas in Supabase Table Editor: `User`, `Topic`, `Snapshot`, `Diff`.

---

## 3. Backend Deployment (Render / Railway)

### Deploying to Render
1. Create a new **Web Service** connected to your repository.
2. Settings:
   - **Environment:** `Node`
   - **Build Command:** `pnpm install && pnpm prisma:generate`
   - **Start Command:** `pnpm start`
   - **Health Check Path:** `/health`
3. Add all environment variables listed above.
4. Render automatically launches `backend/src/index.js`, initializing the Express API server and the background `node-cron` daemon.

---

## 4. Frontend Deployment (Vercel / Netlify)

### Deploying to Vercel
1. Import repository into [Vercel](https://vercel.com).
2. Build Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist`
3. Environment Variables:
   - `VITE_API_URL`: Your backend URL (e.g. `https://noticeme-api.onrender.com`).
   - `VITE_SUPABASE_URL`: Your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key.
4. Deploy. Vite automatically outputs vendor-split chunks with an initial entry payload of **<5 kB**.

---

## 5. SMTP Delivery (Brevo Setup)

> [!IMPORTANT]
> When using Brevo (formerly Sendinblue):
> - Brevo's `SMTP_USER` is a technical identifier (e.g., `7f8...b@smtp-brevo.com`).
> - `ALERT_FROM` **cannot** be the Brevo login address. It must be a verified sender address configured in your Brevo dashboard under **Senders & IP → Senders**.
> - The Notice Me pipeline enforces this constraint automatically and will refuse to mark alerts sent if a technical login is detected as the sender.

---

## 6. Health & Heartbeat Monitoring

Monitor `/health` via external uptime checkers (UptimeRobot, Pingdom, BetterStack):
- Expected HTTP status: `200 OK`
- The payload validates that the minute ticker, pre-fetch, and dispatch schedulers are actively reporting heartbeats:
  ```json
  {
    "status": "ok",
    "scheduler": {
      "running": true,
      "healthy": true
    }
  }
  ```
