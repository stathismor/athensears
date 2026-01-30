# Gig Crawler Service

Automated service that uses AI to find Athens music events on the web and populates the Strapi CMS.

## Features

- Nightly automated discovery of Athens live music events
- Manual trigger via API endpoint
- AI-powered web search + data extraction (single API call)
- Venue matching and creation
- Duplicate detection
- Structured logging

## Architecture

```
Gig Crawler Service
├── Brave AI Grounding API (search + extraction in one call)
│   └── Searches web for Athens events AND extracts structured data
└── Strapi CMS API
    └── Creates/updates gigs and venues
```

## Setup

### Prerequisites

- Node.js >= 24.0.0
- pnpm (for monorepo)
- Brave AI Grounding API key (free tier: 2,000-5,000 queries/month)
- Access to Strapi CMS API

### Installation

From the monorepo root:

```bash
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Required variables:
- `STRAPI_API_URL`: URL of your Strapi CMS (e.g., Railway deployment URL)
- `STRAPI_API_TOKEN`: API token with write permissions for gigs and venues
- `BRAVE_API_KEY`: Your Brave AI Grounding API key

### Getting API Keys

**Brave AI Grounding API**:
1. Sign up at https://api.search.brave.com/app/dashboard
2. Get your API key from the dashboard
3. Free tier: 2,000-5,000 queries/month (search + AI extraction combined)
4. Note: Requires credit card for verification (no charge on free tier)

**Strapi API Token**:
1. Log into your Strapi admin panel
2. Go to Settings > API Tokens
3. Create new token with permissions:
   - `api::gig.gig.create`
   - `api::gig.gig.find`
   - `api::venue.venue.create`
   - `api::venue.venue.find`

## Development

Run in development mode with hot reload:

```bash
pnpm --filter gig-crawler dev
```

## Production

Build and run:

```bash
pnpm --filter gig-crawler build
pnpm --filter gig-crawler start
```

## API Endpoints

### Manual Sync Trigger

Trigger a manual crawl and sync:

```bash
POST http://localhost:3000/api/sync
```

Response:
```json
{
  "status": "completed",
  "summary": {
    "gigsFound": 15,
    "gigsCreated": 12,
    "gigsDuplicate": 3,
    "venuesCreated": 2,
    "errors": []
  },
  "executionTime": "45.3s"
}
```

### Health Check

Check service health:

```bash
GET http://localhost:3000/health
```

## Deployment

This service is designed to be deployed on Railway alongside the CMS.

See `railway.json` for deployment configuration.

## Cron Schedule

By default, the crawler runs nightly at 2 AM Athens time (Europe/Athens timezone).

Customize by setting `CRON_SCHEDULE` environment variable:
- `0 2 * * *` - Every day at 2 AM (default)
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Every Sunday at midnight

## Logging

Logs are output in JSON format using Pino logger.

Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

Set `LOG_LEVEL` environment variable to control verbosity.

## Cost Estimation

With nightly crawling (30 days/month):
- Brave AI Grounding API: ~30 queries/month (well within 2,000-5,000 free tier limit)
- Each query performs: web search + AI extraction + structured output

**Total monthly cost: $0**

## License

ISC
