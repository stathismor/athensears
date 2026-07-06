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

## Endpoints

- `POST /api/sync` - trigger a sync manually
- `GET /health` - health check
- sync status, and bulk delete of non-manual gigs

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
