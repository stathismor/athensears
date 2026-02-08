# Quick Start Guide

Get gig-crawler-2 running in 5 minutes.

## Prerequisites

- Node.js 24+
- pnpm (already installed in monorepo)
- Strapi CMS instance
- API keys: Strapi, Brave Web Search, Google Gemini

## Installation

```bash
# Navigate to project directory
cd apps/gig-crawler-2

# Install dependencies (already done)
pnpm install

# Configure environment
cp .env.example .env
nano .env  # Add your API keys
```

## Required Environment Variables

Edit `.env` with your credentials:

```bash
STRAPI_API_URL=http://localhost:1337
STRAPI_API_TOKEN=your_strapi_token_here
BRAVE_API_KEY=your_brave_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

## Run

```bash
# Development with hot reload
pnpm dev

# Or build and run production
pnpm build
pnpm start
```

## Test

```bash
# Health check
curl http://localhost:3001/health

# Manual sync
curl -X POST http://localhost:3001/api/sync
```

## Check Results

1. Open your Strapi admin: http://localhost:1337/admin
2. Navigate to "Gigs" collection
3. Verify new events were created

## Expected Output

```json
{
  "status": "success",
  "message": "Sync completed successfully",
  "stats": {
    "searchResults": 20,
    "filteredUrls": 8,
    "scrapedUrls": 7,
    "gigsExtracted": 15,
    "gigsCreated": 12,
    "gigsSkipped": 3,
    "errors": 0
  }
}
```

## Scheduled Sync

The service automatically syncs at 2 AM Athens time (same as gig-crawler).

## Troubleshooting

### Service won't start
- Check Node version: `node --version` (need 24+)
- Install deps: `pnpm install`
- Check logs for errors

### No gigs extracted
- Check API keys are correct
- Verify Strapi is accessible
- Check logs for errors

### Gemini API errors
- Check API key is valid
- Verify quota not exceeded
- Check internet connectivity

## Next Steps

- See `README.md` for full documentation
- Check logs for detailed sync information
- Monitor first production sync

## Deployment

Deploy to Railway:
1. Create new Railway service
2. Link GitHub repo
3. Set root: `apps/gig-crawler-2`
4. Add environment variables
5. Deploy

## Done!

Your gig-crawler-2 is now running and discovering Athens music events with a two-pass approach!
