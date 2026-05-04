# DomHunter

AI-powered expiring domain investment research platform. Scans expired and expiring domains, scores them for brandability and investment potential, and surfaces the best opportunities with Telegram alerts.

---

## What it does

- **Scrapes** ExpiredDomains.net across `.com`, `.io`, `.net`, `.co` for dropping domains
- **Scores** every domain on length, pronounceability, TLD value, keyword value, SEO authority, and AI brandability
- **Enriches** domains with RDAP/WHOIS data, backlinks, and OpenPageRank
- **AI valuation** — estimated resale value, niche classification, buyer persona, and recommendation (BUY / WATCH / SKIP)
- **Generates brandable names** — invents new domain names using AI and checks RDAP availability
- **Telegram alerts** — daily digest of expiring domains matching your filters
- **Watchlist** — save domains and get alerted when they drop

---

## Architecture

```
┌─────────────────────────────────────────────┐
│            Single Render Web Service         │
│                                              │
│  Express API  →  /api/*                      │
│  Vite Static  →  /* (SPA)                    │
└──────────────────┬───────────────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
  PostgreSQL               Redis (optional)
  (Neon.tech)           (Upstash free tier)
```

**Monorepo layout:**

```
artifacts/
  api-server/    Express + Drizzle ORM backend  (PORT 8080 locally)
  domhunter/     React + Vite frontend          (PORT 22487 locally)
lib/
  db/            Drizzle schema + migrations
  api-spec/      OpenAPI 3.1 spec (source of truth)
  api-zod/       Generated Zod validation schemas
  api-client-react/  Generated React Query hooks
```

---

## Local development

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- PostgreSQL database (Replit provides one automatically via `DATABASE_URL`)

### Install

```bash
pnpm install
```

### Environment variables

Create a `.env` file in the repo root (or set them in your Replit secrets):

```env
# Required
DATABASE_URL=postgresql://user:password@host:5432/dbname
SESSION_SECRET=any-random-string-at-least-32-chars
PORT=8080           # API server port

# Optional — AI scoring (at least one recommended)
COMETAPI_API_KEY=   # https://cometapi.com  (cheaper, primary)
OPENROUTER_API_KEY= # https://openrouter.ai (fallback)

# Optional — enrichment
OPENPAGERANK_API_KEY=   # https://www.domcop.com/openpagerank/
EXPIREDDOMAINS_SESSION= # Session cookie from expireddomains.net (see below)

# Optional — background jobs
UPSTASH_REDIS_URL=  # https://upstash.com free tier

# Optional — ICANN zone file access
ICANN_USERNAME=
ICANN_PASSWORD=
```

### Push the database schema

```bash
pnpm --filter @workspace/db run push
```

### Run locally (two terminals)

```bash
# Terminal 1 — API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend
PORT=22487 BASE_PATH=/ pnpm --filter @workspace/domhunter run dev
```

Or on Replit, the two workflows start automatically.

### Seed with sample data

```bash
curl -X POST http://localhost:8080/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"source":"sample"}'
```

---

## Deploy to Render.com (free tier)

### Step 1 — Database (Neon.tech — permanent free tier)

> Render's own free PostgreSQL expires after 90 days. Use Neon instead.

1. Go to [neon.tech](https://neon.tech) → sign up free
2. Create a new project → copy the **Connection string** (starts with `postgresql://...`)
3. Keep this handy — you'll paste it as `DATABASE_URL` in Step 4

### Step 2 — Connect GitHub to Render

1. Go to [render.com](https://render.com) → sign up / log in
2. Dashboard → **New** → **Blueprint**
3. Connect your GitHub account, select **this repository**
4. Render detects `render.yaml` and shows a preview of the service

### Step 3 — Create the service

1. Click **Apply** — Render creates:
   - **domhunter** — Web Service (free, Node.js)
2. Wait for the first build (~3–5 minutes)

### Step 4 — Set environment variables

In the Render dashboard → **domhunter** service → **Environment**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string from Step 1 |
| `SESSION_SECRET` | Click **Generate** (or paste any 32+ char random string) |
| `COMETAPI_API_KEY` | Your CometAPI key (optional but recommended) |
| `OPENROUTER_API_KEY` | Your OpenRouter key (optional) |
| `UPSTASH_REDIS_URL` | Your Upstash Redis URL (optional) |
| `OPENPAGERANK_API_KEY` | Your OpenPageRank key (optional) |
| `EXPIREDDOMAINS_SESSION` | Your ExpiredDomains session cookie (optional) |

After adding variables, click **Save Changes** — Render will redeploy automatically.

### Step 5 — Run the database migration

Once deployed, open the **Shell** tab in Render (or run via the Render CLI):

```bash
pnpm --filter @workspace/db run push
```

Or use the one-time job feature, or just hit the seed endpoint once:

```bash
curl -X POST https://your-app.onrender.com/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"source":"sample"}'
```

### Step 6 — Verify

Visit `https://your-app.onrender.com` — DomHunter should load.

Health check: `https://your-app.onrender.com/api/healthz`

---

## Keep-alive cron (prevents free tier sleep)

Render free web services sleep after **15 minutes** of inactivity. Set up a free cron job to ping it every 14 minutes.

### Using cron-job.org (free)

1. Go to [cron-job.org](https://cron-job.org) → sign up free
2. Dashboard → **Create cronjob**
3. Fill in:
   - **Title:** DomHunter keep-alive
   - **URL:** `https://your-app.onrender.com/api/healthz`
   - **Schedule:** Every 14 minutes
     - Select: `*/14` for minutes, `*` for everything else
4. Click **Create** — it will now ping your app every 14 minutes

This keeps the service awake 24/7 at no cost.

---

## Redeploy after changes

### Via GitHub (recommended)

1. Push changes to your `main` branch on GitHub
2. Render detects the push and automatically rebuilds + redeploys

### Manual redeploy

Render dashboard → **domhunter** service → **Manual Deploy** → **Deploy latest commit**

### Environment-only changes

Changing env vars in the Render dashboard triggers an automatic redeploy — no code push needed.

---

## Getting the ExpiredDomains.net session cookie

1. Log in to [expireddomains.net](https://expireddomains.net) in your browser
2. Open DevTools → Application → Cookies → `expireddomains.net`
3. Copy the value of the `cf_clearance` and `sess` cookies, formatted as:
   ```
   cf_clearance=VALUE; sess=VALUE
   ```
4. Paste as `EXPIREDDOMAINS_SESSION` in your environment

The cookie expires periodically — if Force Sync stops working, refresh it.

---

## Setting up Telegram alerts

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → follow prompts → copy the bot token
2. Start a chat with your new bot
3. Get your chat ID: visit `https://api.telegram.org/bot<TOKEN>/getUpdates` after sending the bot a message
4. In DomHunter → **Alerts** page → **New Alert** → paste token and chat ID → save
5. Set your filter (e.g. "Dropping in 3 days", max SLD length 12, `.com` only)

---

## Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Express session signing key (min 32 chars) |
| `PORT` | Yes | — | Port the server listens on (Render sets this automatically) |
| `NODE_ENV` | — | `development` | Set to `production` on Render |
| `COMETAPI_API_KEY` | Recommended | — | AI scoring via CometAPI (Claude Haiku 3.5) |
| `OPENROUTER_API_KEY` | Recommended | — | AI scoring via OpenRouter (fallback) |
| `UPSTASH_REDIS_URL` | Optional | — | BullMQ background job queue |
| `OPENPAGERANK_API_KEY` | Optional | — | Domain Authority enrichment |
| `EXPIREDDOMAINS_SESSION` | Optional | — | Session cookie for ExpiredDomains scraping |
| `ICANN_USERNAME` | Optional | — | CZDS zone file access |
| `ICANN_PASSWORD` | Optional | — | CZDS zone file access |

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/healthz` | Health check (used by keep-alive cron) |
| `GET` | `/api/domains` | List domains with filters/pagination |
| `GET` | `/api/domains/:fqdn` | Get single domain with metrics |
| `POST` | `/api/domains/:fqdn/enrich` | Run full enrichment + AI scoring |
| `GET` | `/api/domains/top-scoring` | Top 10 highest-scored domains |
| `GET` | `/api/domains/expiring-soon` | Domains expiring within 7 days |
| `GET` | `/api/domains/stats` | Aggregate stats (total, by tier, etc.) |
| `POST` | `/api/ingest` | Trigger domain ingestion (`source`: `expired_domains`, `brandable`, `sample`, `icann`) |
| `GET` | `/api/watchlist` | Get watchlist for demo user |
| `POST` | `/api/watchlist` | Add domain to watchlist |
| `DELETE` | `/api/watchlist/:domainId` | Remove from watchlist |
| `GET` | `/api/analytics/niche-breakdown` | Domain count by niche |
| `GET` | `/api/analytics/da-vs-score` | DA vs rarity score scatter data |
| `POST` | `/api/alerts` | Create Telegram alert config |
| `POST` | `/api/alerts/send-now` | Send an immediate Telegram alert |
| `POST` | `/api/alerts/watch-domain` | Set alert for when a specific domain drops |
| `POST` | `/api/brand-check` | Check domain availability + AI brand score |

---

## Database schema

```
domains          — domain name, TLD, status, source, auction data
metrics          — scores, AI values, WHOIS data (1:1 with domain)
users            — demo user
watchlist_items  — user ↔ domain many:many
alerts           — Telegram alert configurations
```

Push schema changes:
```bash
pnpm --filter @workspace/db run push
```

Regenerate API client after changing `lib/api-spec/openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Domain scoring breakdown

| Component | Weight | Description |
|-----------|--------|-------------|
| Pronounceability | 35% | How easy the SLD is to say and remember |
| Length | 25% | Shorter = higher score (≤5 chars = 100) |
| TLD Value | 20% | `.com`=100, `.ai`=90, `.io`=78, `.co`=60… |
| Keyword Value | 20% | Presence of high-value keywords (insurance, AI, health…) |
| SEO Bonus | +0–5 | Domain Authority from OpenPageRank |
| Backlink Bonus | +0–5 | Backlink count from OpenLinkProfiler |
| Trend Bonus | +0–5 | Google Trends signal (random if not enriched) |

Tiers: **Legendary** (85+) · **Epic** (70–84) · **Rare** (55–69) · **Uncommon** (40–54) · **Common** (<40)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TailwindCSS v4, shadcn/ui, React Query, Wouter |
| Backend | Express 5, Drizzle ORM, PostgreSQL, BullMQ |
| AI | CometAPI (Claude Haiku 3.5) / OpenRouter (Gemini Flash 1.5) |
| Data | ExpiredDomains.net scraper, RDAP, OpenPageRank, OpenLinkProfiler |
| Monorepo | pnpm workspaces, OpenAPI codegen (Orval) |
| Hosting | Render.com (free) + Neon.tech PostgreSQL (free) |
