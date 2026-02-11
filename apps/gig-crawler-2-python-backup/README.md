# Gig Crawler 2

Python-based service for discovering and extracting Athens music event data using a two-pass approach.

## Architecture

Two-pass workflow:
1. **Pass 1 - Discovery**: Brave Web Search → Gemini filters URLs
2. **Pass 2 - Extraction**: Trafilatura scrapes → Gemini extracts JSON

## Key Differences from gig-crawler

- **Language**: Python (better fit for requests + trafilatura)
- **LLM**: Google Gemini instead of Brave AI Grounding
- **Approach**: Two-pass (search → filter → scrape → extract)
- **Deployment**: Runs in parallel with existing TypeScript gig-crawler

## Setup

### Prerequisites

- Python 3.11+
- Strapi CMS instance (shared with gig-crawler)
- Brave Web Search API key
- Google Gemini API key

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Run development server
uvicorn src.main:app --reload --port 3001
```

### Docker Development

```bash
# Build and run with Docker
docker build -f Dockerfile.dev -t gig-crawler-2-dev .
docker run -p 3001:3001 --env-file .env gig-crawler-2-dev
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/sync` - Trigger manual sync
- `GET /` - Service info

## Scheduled Sync

Runs automatically at 2 AM Athens time (same as gig-crawler).

Configure via environment variables:
- `CRON_SCHEDULE=0 2 * * *`
- `TIMEZONE=Europe/Athens`

## Environment Variables

See `.env.example` for all available configuration options.

## Deployment

### Railway

1. Create new Railway service
2. Link to GitHub repo
3. Set root directory: `apps/gig-crawler-2`
4. Add environment variables from `.env.example`
5. Deploy

The service will use the `Dockerfile` and `railway.json` configuration.

## Testing

```bash
# Manual sync via API
curl -X POST http://localhost:3001/api/sync

# Check health
curl http://localhost:3001/health
```

## Logs

The service logs detailed information about:
- Number of search results found
- Number of URLs filtered by Gemini
- Number of URLs successfully scraped
- Number of gigs extracted
- Number of gigs created vs duplicates
- Any errors or failures

## Cost Estimate

With `gemini-1.5-flash`:
- ~$0.02 per sync
- ~$0.60/month (30 syncs)

## License

MIT
