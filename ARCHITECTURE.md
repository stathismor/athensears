# Architecture

## Overview

Athens Ears is a curated live music listing for Athens, Greece. Every night it crawls a
hand-maintained set of known venues and ticketing pages, extracts upcoming gigs in genres like
rock, indie, post-punk, metal, post-rock, jazz, folk and experimental - strictly filtering out
mainstream pop, commercial EDM, hip-hop, tributes, comedy/theatre and Greek popular music -
and publishes them to a server-rendered site.

## Monorepo Structure

pnpm 10 workspaces with three apps:

```
apps/
├── gig-crawler/   # Node.js/Express - crawls curated sources, extracts gigs
├── cms/           # Strapi 5 - stores venues and gigs in PostgreSQL
└── web/           # Astro 5 (SSR) - server-rendered listing of upcoming gigs
```

## Services

### gig-crawler

Express HTTP server that runs the sync pipeline on a cron schedule (daily at 02:00 Athens time
by default). Exposes endpoints for manual sync trigger (`POST /api/sync`), sync status, health
check, and bulk delete.

Discovery is driven by a **curated source registry** (`src/models/sources.ts`) - not open-web
search. Each source is a known Athens venue or a ticketing aggregator with one or more
`listingUrls` pointing at its upcoming-events page. This makes every run deterministic, cheap
and high signal. To add a venue, add an entry to the registry.

Built on a hexagonal architecture - the core `SyncGigsCommand` depends only on three port
interfaces (`ScraperPort`, `LLMPort`, `GigsPort`), with concrete adapters injected at startup:

| Port | Adapter | External Service |
|---|---|---|
| `ScraperPort` | `PlaywrightAdapter` | Chromium (headless) |
| `LLMPort` | `GeminiAdapter` | Google Gemini (Flash-Lite by default) |
| `GigsPort` | `StrapiAdapter` | Strapi REST API |

### cms (Strapi 5)

Headless CMS backed by PostgreSQL 16. Content types:

- **Gig** - title, date, time_display, price, description, url, **genre**, manual (boolean), venue (relation)
- **Venue** - name, address, website, neighborhood
- **Crawl Cache** (single-type) - one internal JSON blob (`data`) holding the crawler's
  extraction cache; written by the crawler via its API token, not exposed publicly

On bootstrap, grants public read access to both content types and seeds sample data if the
database is empty. A custom `POST /api/gigs/deleteAll` endpoint supports bulk cleanup of
non-manual gigs.

The `manual` flag is the manual-edit contract: the crawler always writes `manual: false` and
**never updates a gig where `manual: true`**. When you add or fix a gig in the Strapi admin,
tick `manual` so the nightly run leaves it alone.

### web (Astro 5, SSR)

Server-rendered site (`@astrojs/node`, standalone) styled with Tailwind CSS. Fetches future
gigs from Strapi **per request** (`/api/gigs?populate=venue&sort=date:asc`), groups them by
month, and renders a responsive listing. Because it renders live, new nightly gigs and manual
CMS edits appear immediately - no rebuild. A `Cache-Control: max-age=300` header keeps Strapi
from being hit on every request. Server-side fetches prefer `STRAPI_INTERNAL_URL` (private
networking) and fall back to `PUBLIC_STRAPI_URL`.

## Data Flow

The crawler walks the registry source by source:

```
For each enabled source in GIG_SOURCES:
  Pass A - Listing
    Playwright scrapes the source's listingUrl(s)
    → Gemini identifies event-detail URLs among the page links
    → deduplicated, capped per source

  Pass B - Detail extraction
    Playwright scrapes detail pages (+ the listing page itself for venues)
    → extracts JSON-LD, OpenGraph, Readability text
    → Gemini batch-extracts structured gigs with a strict taste filter,
      emitting a `genre` per gig (out-of-genre events are rejected)
    → extraction cache: pages whose content hash is unchanged since a recent run
      skip the Gemini call and replay stored gigs (see Cost controls)
    → for venue sources, the known canonical venue name is stamped onto every gig

Then, across all sources:
  → price/URL normalization, date-range filtering, genre backstop
  → broken ticket URLs are cleared (gig kept, links to venue site)
  → upsert into Strapi: create new, update existing auto gigs, skip manual gigs
```

The run is **non-destructive** - it never clears-then-rebuilds, so a failed scrape night
leaves existing gigs in place rather than emptying the site.

## Third-Party Services

| Service | Purpose |
|---|---|
| **Google Gemini** (Flash-Lite, via `GEMINI_MODEL`) | Event-link filtering, structured gig extraction + taste/genre classification (JSON mode, temp 0.1) |
| **Playwright/Chromium** | Headless browser for scraping (with Readability + JSON-LD extraction) |
| **Strapi 5** | Headless CMS with REST API for venue/gig storage |
| **PostgreSQL 16** | Persistent database |

## Deduplication & idempotency

- **Curated registry** - discovery is limited to known-good sources, so noise never enters.
- **Per-source venue stamping** - venue sources assign their canonical venue name directly,
  eliminating venue-name drift / duplicate venues.
- **Upsert on title + date** - `findGig(title, date)` (case-insensitive, same-day) merges the
  same gig found via multiple sources; existing auto gigs are updated, manual gigs untouched.
- **Genre backstop** - gigs the model marks `reject` (or leaves ungenred) are dropped in code.
- **Prompt-level** - extraction collapses multi-band/festival lineups into one event.

Venue normalization adds another layer: an alias map (`venueAliases.ts`) canonicalizes names
like "gagarin" → "Gagarin 205" for aggregator-sourced gigs, with an in-memory cache.

## Cost controls

Gemini token spend (extraction is >95% of it) is bounded by:

- **Model tier** - `GEMINI_MODEL` defaults to `gemini-flash-lite-latest` (cheapest). Bump to
  `gemini-flash-latest` if extraction/taste-filter quality regresses.
- **Extraction cache** (`PageExtractionCache`) - each scraped page's prompt content is hashed
  (SHA-256 of the exact `{url,content}` string sent to the model); a hit (same hash, within
  `CRAWLER_CACHE_TTL_DAYS`) replays stored gigs instead of calling Gemini. Since event pages
  rarely change, most nights re-pay for almost nothing. The batch extraction prompt returns
  gigs grouped by page so each page's result caches independently. Cached gigs are re-filtered
  against the (daily-shifting) date window on replay; a TTL forces periodic re-extraction so
  far-future events entering the window self-heal.
  - **Storage:** the whole `url → {hash,gigs}` map is one JSON blob in the Strapi `crawl-cache`
    single-type (Postgres) - no files or volumes. The crawler reaches it over REST with its
    existing token (needs `crawl-cache` find + update); `StrapiCacheStore` does one GET to load
    and one PUT to save per run. Loaded once at sync start, flushed once at the end.
  - **Fail-safe:** if the cache is unreachable or `CRAWLER_CACHE_ENABLED=false`, every lookup
    misses and nothing is written - the run just makes more Gemini calls, never breaks.
- **Volume knobs** - `SYNC_MAX_DETAIL_PER_SOURCE` (pages/source), `GEMINI_CHUNK_SIZE`
  (pages/call), `CRON_SCHEDULE` (run frequency).

## Architecture Patterns

- **Hexagonal (Ports & Adapters)** - domain logic in `SyncGigsCommand` depends on port
  interfaces; adapters are injected at the composition root (`index.ts`)
- **Command pattern** - `SyncGigsCommand.execute()` encapsulates the full sync, returns `SyncStats`
- **Constructor injection** - all adapters injected into the command; fully mockable for testing
- **Schema-first validation** - Zod schemas define all external boundaries (API responses, env
  vars, model shapes) with `z.infer<>` for type derivation

## Infrastructure

### Docker Compose (development)

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Persistent volume, healthcheck via `pg_isready` |
| `cms` | `node:24-alpine` | Mounts source for live reload, depends on healthy postgres |
| `gig-crawler` | `mcr.microsoft.com/playwright:v1.52.0-noble` | Chromium bundled, depends on cms |
| `web` | `node:24-alpine` (SSR build) | Server-renders from cms, optional for local use |

### Production (Railway)

| Service | Platform |
|---|---|
| `cms` | Railway (Docker) |
| `gig-crawler` | Railway (Docker, healthcheck at `/health`) |
| `web` | Railway (Docker, SSR node server) |
| `postgres` | Railway |
