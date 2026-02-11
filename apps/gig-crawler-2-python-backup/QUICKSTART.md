# Quick Start Guide

Get gig-crawler-2 running in 5 minutes.

## Prerequisites

- Python 3.11+
- Strapi CMS instance
- API keys: Strapi, Brave Web Search, Google Gemini

## Installation

```bash
# Navigate to project directory
cd apps/gig-crawler-2

# Run setup script
./setup.sh

# Activate virtual environment
source venv/bin/activate

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
# Start the service
uvicorn src.main:app --reload --port 3001
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
    "search_results": 20,
    "filtered_urls": 8,
    "scraped_urls": 7,
    "gigs_extracted": 15,
    "gigs_created": 12,
    "gigs_skipped": 3,
    "errors": 0
  }
}
```

## Docker (Alternative)

```bash
# Build
docker build -t gig-crawler-2 .

# Run
docker run -p 3001:3001 --env-file .env gig-crawler-2

# Test
curl http://localhost:3001/health
```

## Scheduled Sync

The service automatically syncs at 2 AM Athens time.

Configure via environment variables:
```bash
CRON_SCHEDULE=0 2 * * *
TIMEZONE=Europe/Athens
```

## Troubleshooting

### Service won't start
- Check Python version: `python3 --version` (need 3.11+)
- Activate venv: `source venv/bin/activate`
- Install deps: `pip install -r requirements.txt`

### No gigs extracted
- Check API keys are correct
- Verify Strapi is accessible
- Check logs for errors
- Test individual adapters (see TESTING.md)

### Gemini API errors
- Check API key is valid
- Verify quota not exceeded
- Check internet connectivity

## Next Steps

- See `TESTING.md` for comprehensive testing guide
- See `README.md` for full documentation
- See `IMPLEMENTATION.md` for architecture details

## Support

Check logs for detailed error messages:
```bash
# Logs show:
# - Search results found
# - URLs filtered
# - URLs scraped
# - Gigs extracted
# - Gigs created
# - Any errors
```

## Deployment

Deploy to Railway:
1. Create new Railway service
2. Link GitHub repo
3. Set root: `apps/gig-crawler-2`
4. Add environment variables
5. Deploy

## Done!

Your gig-crawler-2 is now running and discovering Athens music events.
