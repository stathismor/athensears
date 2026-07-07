# gig-crawler

Express service that crawls a curated set of Athens venues and ticketing pages
nightly, extracts upcoming gigs, and upserts them into the Strapi CMS.

## How it works

Discovery is driven by a **curated source registry** (`src/models/sources.ts`),
not open-web search - every run is deterministic, cheap, and high signal. For each
source the crawler scrapes its listing page(s), has Gemini pick out event-detail
links, scrapes those, and batch-extracts structured gigs with a strict genre/taste
filter. Results are upserted into Strapi: new gigs created, existing auto gigs
updated, `manual` gigs left untouched.

Built on a hexagonal architecture - `SyncGigsCommand` depends on three ports, with
concrete adapters injected at startup:

| Port | Adapter | Service |
|---|---|---|
| `ScraperPort` | Playwright | Chromium (headless) |
| `LLMPort` | Gemini | Google Gemini |
| `GigsPort` | Strapi | Strapi REST API |

See the root `ARCHITECTURE.md` for the full data flow and cost controls.

## API

A small HTTP surface for operating the service (the sync also runs on a cron - see Setup).
If `SYNC_API_KEY` is set, the state-changing endpoints require `Authorization: Bearer
$SYNC_API_KEY` (calls without it get `401`).

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness probe - `{ "status": "ok", ... }`. |
| `/` | GET | Service info + endpoint list. |
| `/api/sync` | POST | Trigger a sync, or the normalize backfill. Background, returns immediately. |
| `/api/sync/status` | GET | `{ "status": "running" \| "idle", "isRunning": bool }`. |
| `/api/gigs/delete` | POST | Bulk-delete non-manual gigs. Dry-run by default. |

### `POST /api/sync`

Non-blocking: starts a background run and returns `{ "status": "started" }` immediately
(or `409 already_running` if one is in flight - only one sync/normalize runs at a time).
Progress and the result summary are logged. Options go in the JSON body; all are optional.

**Scrape mode (default)** - crawl the sources and upsert (create new, update existing auto
gigs, leave `manual` gigs untouched):

| Field | Type | Default | Effect |
|---|---|---|---|
| `clear` | bool | `false` | Destructive: wipe non-manual gigs first, then rebuild from the scrape. Rarely needed - a normal run already refreshes. |
| `force` (or `cache: false`) | bool | cache on | Bypass the extraction cache: full re-extraction through Gemini (also skips writing the cache). |
| `monthsAhead` | number | `SYNC_MONTHS_AHEAD` | How far ahead to crawl (today -> +N months). |
| `maxSources` | number | all | Crawl at most N sources (test knob). |
| `sources` | string[] or CSV | all | Restrict to specific source ids, e.g. `["more.com"]` or `"more.com,fuzz-club"`. Applied before `maxSources`. |

**Normalize mode** (`normalize: true`) - re-clean stored gig titles/venues **in place**, no
scraping and no LLM. Re-runs the same title/venue cleaners the sync applies at write time
over every stored gig, updates rows whose cleaned form changed (keeping their id and
`manual` flag), and merges duplicates that cleaning collapses onto one row. Idempotent -
safe to re-run whenever the cleaning rules change. It ignores the scrape-mode fields above.

| Field | Type | Default | Effect |
|---|---|---|---|
| `normalize` | bool | `false` | Run the in-place backfill instead of scraping. |
| `includeManual` | bool | `false` | Also re-clean hand-edited (`manual`) gigs. Off by default so manual edits are left alone. |

> Normalize applies immediately (no preview) and **deletes** merged duplicate rows. It's
> idempotent and the full report is logged, but deletions aren't reversible.

```bash
# Nightly-style sync (same as the cron)
curl -XPOST https://<crawler-url>/api/sync

# Force a full re-extraction (skip the cache)
curl -XPOST https://<crawler-url>/api/sync \
  -H 'Content-Type: application/json' -d '{"force": true}'

# Test one source cheaply (more.com is deterministic - no LLM spend)
curl -XPOST https://<crawler-url>/api/sync \
  -H 'Content-Type: application/json' -d '{"sources": ["more.com"]}'

# Re-clean stored gig titles/venues in place (backfill)
curl -XPOST https://<crawler-url>/api/sync \
  -H 'Content-Type: application/json' -d '{"normalize": true}'

# ...including manual gigs
curl -XPOST https://<crawler-url>/api/sync \
  -H 'Content-Type: application/json' -d '{"normalize": true, "includeManual": true}'
```

Add `-H "Authorization: Bearer $SYNC_API_KEY"` when a token is configured.

### `POST /api/gigs/delete`

Bulk-deletes **non-manual** gigs (manual gigs are always protected). **Dry-run by default**:
it returns what *would* be deleted and what's protected, and only deletes when you pass
`{"dryRun": false}`.

```bash
# Preview (safe)
curl -XPOST https://<crawler-url>/api/gigs/delete

# Actually delete non-manual gigs
curl -XPOST https://<crawler-url>/api/gigs/delete \
  -H 'Content-Type: application/json' -d '{"dryRun": false}'
```

## Setup

```bash
cp .env.example .env   # add GEMINI_API_KEY and STRAPI_API_TOKEN
pnpm install
pnpm --filter gig-crawler dev
```

The sync also runs on a schedule (daily at 02:00 Athens time by default, via
`CRON_SCHEDULE`). See `.env.example` for all configuration options.

## Deployment

Runs on Railway as a Docker service. See `docs/DEPLOY.md`.
