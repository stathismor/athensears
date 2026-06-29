# Architecture

## Overview

Athens Ears is a live music event aggregator for Athens, Greece. It automatically discovers, scrapes, and displays upcoming gigs in genres like rock, indie, post-punk, electronic, jazz, and experimental — filtering out mainstream pop, EDM, hip-hop, and Greek popular music.

## Monorepo Structure

pnpm 10 workspaces with three apps:

```
apps/
├── gig-crawler/   # Node.js/Express — discovers and extracts gig data
├── cms/           # Strapi 5 — stores venues and gigs in PostgreSQL
└── web/           # Astro 5 — single-page frontend showing upcoming gigs
```

## Services

### gig-crawler

Express HTTP server that runs a three-pass discovery pipeline on a cron schedule (daily at 02:00 Athens time by default). Exposes endpoints for manual sync trigger (`POST /api/sync`), sync status, health check, and bulk delete.

Built on a hexagonal architecture — the core `SyncGigsCommand` depends only on four port interfaces (`SearchPort`, `ScraperPort`, `LLMPort`, `GigsPort`), with concrete adapters injected at startup:

| Port | Adapter | External Service |
|---|---|---|
| `SearchPort` | `BraveSearchAdapter` | Brave Web Search API |
| `ScraperPort` | `PlaywrightAdapter` | Chromium (headless) |
| `LLMPort` | `GeminiAdapter` | Google Gemini 1.5 Flash |
| `GigsPort` | `StrapiAdapter` | Strapi REST API |

### cms (Strapi 5)

Headless CMS backed by PostgreSQL 16. Two content types:

- **Gig** — title, date, time_display, price, description, url, manual (boolean), venue (relation)
- **Venue** — name, address, website, neighborhood

On bootstrap, grants public read access to both content types and seeds sample data if the database is empty. A custom `POST /api/gigs/deleteAll` endpoint supports bulk cleanup of non-manual gigs.

### web (Astro 5)

Static single-page site styled with Tailwind CSS. Fetches future gigs from Strapi at build time (`/api/gigs?populate=venue&sort=date:asc`), groups them by month, and renders a responsive listing. Gig titles link to event/ticket pages; venue names link to venue websites.

## Data Flow

The crawler runs a three-pass pipeline:

```
Pass 1 — Discovery
  Brave Search (3 queries: Greek + English)
  → up to 60 results, deduplicated
  → Gemini filters to 5–10 promising listing-page URLs
  + 2 hardcoded fallback URLs

Pass 2 — Link Extraction
  Playwright scrapes listing pages (concurrency pool)
  → Gemini identifies event detail URLs per page (up to 20 each)
  → deduplicated, shuffled, capped at 100 URLs

Pass 3 — Detail Extraction
  Playwright scrapes detail pages
  → extracts JSON-LD structured data, OpenGraph tags, Readability text
  → Gemini batch-extracts structured gig data (chunked, rate-limited)
  → price/URL normalization, date range filtering
  → deduplicate against Strapi, upsert venues, create gigs
```

## Third-Party Services

| Service | Purpose |
|---|---|
| **Brave Search API** | Web search for event listing pages (3 queries per sync) |
| **Google Gemini** (1.5 Flash) | URL filtering, event link filtering, structured gig extraction (JSON mode, temp 0.1) |
| **Playwright/Chromium** | Headless browser for scraping (with Readability + JSON-LD extraction) |
| **Strapi 5** | Headless CMS with REST API for venue/gig storage |
| **PostgreSQL 16** | Persistent database |

## Deduplication

Four layers prevent duplicate gigs:

1. **URL-level** — `Set` deduplicates search results and discovered event URLs
2. **Source diversity** — event URLs shuffled before capping at 100 to avoid over-indexing a single source
3. **Title + date check** — before storage, `findGig(title, date)` queries Strapi with case-insensitive title match and same-day date range
4. **Prompt-level** — extraction prompt instructs Gemini to avoid duplicate entries and collapse multi-band festival lineups

Venue normalization adds another layer: an alias map (~20 Athens venues) canonicalizes names like "gagarin" → "Gagarin 205", and an in-memory cache avoids repeated Strapi lookups within a sync.

## Architecture Patterns

- **Hexagonal (Ports & Adapters)** — domain logic in `SyncGigsCommand` depends on port interfaces; adapters are injected at the composition root (`index.ts`)
- **Command pattern** — `SyncGigsCommand.execute()` encapsulates the full sync pipeline, returns `SyncStats`
- **Constructor injection** — all adapters injected into the command; fully mockable for testing
- **Schema-first validation** — Zod schemas define all external boundaries (API responses, env vars, model shapes) with `z.infer<>` for type derivation

## Infrastructure

### Docker Compose (development)

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Persistent volume, healthcheck via `pg_isready` |
| `cms` | `node:24-alpine` | Mounts source for live reload, depends on healthy postgres |
| `gig-crawler` | `mcr.microsoft.com/playwright:v1.52.0-noble` | Chromium bundled, depends on cms |

### Production (Railway + Netlify)

| Service | Platform |
|---|---|
| `cms` | Railway (Docker) |
| `gig-crawler` | Railway (Docker, healthcheck at `/health`) |
| `postgres` | Railway |
| `web` | Netlify (static build from `apps/web/dist`) |
