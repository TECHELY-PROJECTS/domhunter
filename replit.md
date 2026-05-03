# DomHunter — Automated Domain Investment Research Platform

## Architecture

This is a pnpm monorepo with three workspace areas:

### Artifacts (Runnable Services)
- **`artifacts/domhunter`** — React + Vite frontend (port 22487, preview path `/`)
  - Pages: Terminal (home), Explore, Domain Detail, Portfolio, Analytics, Brand Checker
  - Uses `@workspace/api-client-react` generated React Query hooks
  - Dark theme with orange accent, Tailwind CSS v4
- **`artifacts/api-server`** — Express API server (port 8080, path `/api`)
  - Routes: `/api/domains`, `/api/watchlist`, `/api/analytics`, `/api/ingest`, `/api/enrichment`, `/api/brand-check`
  - BullMQ job queue for async AI scoring (requires `UPSTASH_REDIS_URL`, optional)
  - Standalone AI client: CometAPI first, OpenRouter fallback (no Replit AI integration needed)
- **`artifacts/mockup-sandbox`** — Canvas design tool (port 8081, path `/__mockup`)

### Shared Libraries
- **`lib/db`** — Drizzle ORM + PostgreSQL schema (domains, metrics, watchlist, users tables)
- **`lib/api-spec`** — OpenAPI 3.1 spec (`openapi.yaml`) — source of truth for all API contracts
- **`lib/api-client-react`** — Generated React Query hooks (from OpenAPI via Orval)
- **`lib/api-zod`** — Generated Zod validation schemas (from OpenAPI via Orval)

## Key Workflows

| Workflow | Command |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| DomHunter Frontend | `pnpm --filter @workspace/domhunter run dev` |

## Environment Variables / Secrets

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection (auto-set by Replit DB) |
| `COMETAPI_API_KEY` | Optional | AI provider (CometAPI — cheaper, primary) |
| `OPENROUTER_API_KEY` | Optional | AI provider (OpenRouter — fallback) |
| `UPSTASH_REDIS_URL` | Optional | BullMQ job queue (background AI scoring) |
| `OPENPAGERANK_API_KEY` | Optional | Domain authority enrichment |
| `EXPIREDDOMAINS_SESSION` | Optional | ExpiredDomains.net scraping |
| `ICANN_USERNAME` / `ICANN_PASSWORD` | Optional | CZDS zone file access |
| `SESSION_SECRET` | Yes | Express session signing |

**AI Setup:** If neither `COMETAPI_API_KEY` nor `OPENROUTER_API_KEY` is set, AI features return null gracefully. The app still works — domains just won't have AI valuations.

## Data Flow

1. **Ingest** — `POST /api/ingest` pulls domains from GoDaddy RSS, NameJet, ExpiredDomains, ICANN CZDS, or sample data
2. **Score** — `POST /api/domains/:fqdn/enrich` runs RDAP lookup, backlink fetching, rarity scoring, and optional AI valuation
3. **Display** — Frontend reads scored domains via React Query hooks, renders Terminal/Explore/Analytics pages
4. **Watchlist** — Demo user `demo-user-1` can save domains for monitoring

## OpenAPI + Codegen

After changing `lib/api-spec/openapi.yaml`, regenerate client hooks and Zod schemas:
```bash
pnpm --filter @workspace/api-spec run codegen
```

## Database Schema

Tables: `domains`, `metrics` (1:1 with domain), `users`, `watchlist_items` (many:many junction)

Push schema changes to dev DB:
```bash
pnpm --filter @workspace/db run push
```

## Seeding Sample Data

```bash
curl -X POST http://localhost:80/api/ingest -H "Content-Type: application/json" -d '{"source":"sample"}'
```
This inserts 20 pre-scored sample domains (fundpeak.com, orbis.ai, cloudmesh.io, etc.)

## AI Client (`artifacts/api-server/src/lib/ai/client.ts`)

Standalone fetch-based client — no Replit AI integration required.
- Sets `COMETAPI_API_KEY` → uses CometAPI (claude-haiku-3-5, ~40% cheaper)
- No CometAPI key → falls back to `OPENROUTER_API_KEY` with OpenRouter (gemini-flash-1.5)
- Functions: `aiScoreDomain()`, `aiScoreBatch()`, `aiDeepAnalysis()`

## Source

Originally developed externally and migrated to this workspace. Source is preserved at `/tmp/domhunter` (ephemeral — not committed).
