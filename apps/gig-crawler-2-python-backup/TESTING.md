# Testing Guide for gig-crawler-2

This guide walks through testing the service locally before deployment.

## Prerequisites

Before testing, ensure you have:

1. **API Keys**:
   - Strapi API token (from your Strapi instance)
   - Brave Web Search API key
   - Google Gemini API key

2. **Running Services**:
   - Strapi CMS instance (local or remote)

## Setup

```bash
# Run setup script
./setup.sh

# Activate virtual environment
source venv/bin/activate

# Edit .env with your API keys
nano .env
```

Required environment variables in `.env`:
```
STRAPI_API_URL=http://localhost:1337  # or your Strapi URL
STRAPI_API_TOKEN=your_token_here
BRAVE_API_KEY=your_brave_key_here
GEMINI_API_KEY=your_gemini_key_here
```

## Unit Tests

Run the basic unit tests:

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

## Local Development Testing

### 1. Start the Development Server

```bash
uvicorn src.main:app --reload --port 3001
```

Expected output:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Starting gig-crawler-2 service
INFO:     Environment: development
INFO:     Strapi API: http://localhost:1337
INFO:     Gemini Model: gemini-1.5-flash
INFO:     Cron Schedule: 0 2 * * *
INFO:     Scheduler started
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:3001
```

### 2. Test Health Endpoint

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "gig-crawler-2",
  "version": "2.0.0",
  "environment": "development"
}
```

### 3. Test Manual Sync

Trigger a manual sync to test the full workflow:

```bash
curl -X POST http://localhost:3001/api/sync
```

This will:
1. Search Brave for Athens music events
2. Filter URLs with Gemini
3. Scrape filtered URLs with trafilatura
4. Extract gigs with Gemini
5. Store in Strapi

Expected response (after processing):
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

### 4. Check Logs

Monitor the console output for detailed logs:

```
INFO - Searching Brave for: live music events concerts gigs Athens Greece February 2026
INFO - Found 20 search results
INFO - Filtering 20 search results with Gemini
INFO - Filtered to 8 promising URLs
INFO - Scraping 8 URLs concurrently
INFO - Scraped 7/8 URLs successfully
INFO - Extracting gigs from https://example.com/events
INFO - Extracted 3 gigs from https://example.com/events
INFO - Created gig 123: Artist Name on 2026-02-15 20:00:00
INFO - Skipping duplicate gig: Another Artist on 2026-02-16 21:00:00
```

### 5. Verify Data in Strapi

Check your Strapi admin panel:
1. Go to http://localhost:1337/admin
2. Navigate to "Gigs" collection
3. Verify new gigs were created
4. Check that venues were created/matched correctly

## Docker Testing

### Build and Run with Docker

```bash
# Build development image
docker build -f Dockerfile.dev -t gig-crawler-2-dev .

# Run container
docker run -p 3001:3001 --env-file .env gig-crawler-2-dev
```

### Build Production Image

```bash
# Build production image
docker build -t gig-crawler-2 .

# Run container
docker run -p 3001:3001 --env-file .env gig-crawler-2
```

## Testing Individual Components

### Test Brave Search Adapter

Create a test script `test_brave.py`:

```python
import asyncio
from src.adapters.brave_search.brave_search_adapter import BraveSearchAdapter
from src.config import settings

async def test_search():
    adapter = BraveSearchAdapter(api_key=settings.brave_api_key)
    results = await adapter.search("Athens music events February 2026", count=10)
    print(f"Found {len(results)} results")
    for r in results[:3]:
        print(f"- {r.title}: {r.url}")
    await adapter.close()

asyncio.run(test_search())
```

Run: `python test_brave.py`

### Test Trafilatura Scraper

Create a test script `test_scraper.py`:

```python
import asyncio
from src.adapters.content_scraper.trafilatura_adapter import TrafilaturaAdapter

async def test_scraper():
    adapter = TrafilaturaAdapter()
    result = await adapter.scrape("https://www.viva.gr/tickets/music/")
    print(f"Success: {result.success}")
    print(f"Text length: {len(result.text) if result.text else 0}")
    print(f"Preview: {result.text[:200] if result.text else 'No text'}")
    await adapter.close()

asyncio.run(test_scraper())
```

Run: `python test_scraper.py`

### Test Gemini LLM Adapter

Create a test script `test_gemini.py`:

```python
import asyncio
from src.adapters.llm.gemini_adapter import GeminiLLMAdapter
from src.models.search_result import SearchResult
from src.config import settings

async def test_filter():
    adapter = GeminiLLMAdapter(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model
    )

    results = [
        SearchResult(
            url="https://www.viva.gr/tickets/music/",
            title="Music Events - Viva.gr",
            description="Upcoming music events in Athens"
        ),
        SearchResult(
            url="https://en.wikipedia.org/wiki/Athens",
            title="Athens - Wikipedia",
            description="Athens is the capital of Greece"
        )
    ]

    urls = await adapter.filter_promising_urls(results)
    print(f"Filtered to {len(urls)} URLs:")
    for url in urls:
        print(f"- {url}")

asyncio.run(test_filter())
```

Run: `python test_gemini.py`

## Common Issues

### Issue: "Module not found" errors

**Solution**: Make sure virtual environment is activated
```bash
source venv/bin/activate
```

### Issue: Gemini API rate limit errors

**Solution**: Add delays between requests or use exponential backoff (already implemented in retry decorator)

### Issue: No gigs extracted

**Potential causes**:
1. Search results don't contain Athens event sites
2. Gemini filtered out all URLs
3. Trafilatura failed to extract text
4. Gemini extraction prompt needs tuning

**Debug steps**:
1. Check logs for search results
2. Check filtered URLs
3. Check scraped content length
4. Test Gemini extraction with known event pages

### Issue: Duplicate gigs created

**Solution**: The service checks for duplicates by title + date. Make sure:
1. Dates are parsed correctly
2. Titles match exactly (case-sensitive)
3. Check Strapi for existing gigs

## Performance Benchmarks

Expected performance for a typical sync:

| Metric | Target | Notes |
|--------|--------|-------|
| Total time | < 5 minutes | End-to-end sync |
| Search time | < 5 seconds | Brave API call |
| Filter time | < 10 seconds | Gemini Pass 1 |
| Scrape time | < 30 seconds | 8 URLs concurrently |
| Extract time | < 60 seconds | Gemini Pass 2 (8 pages) |
| Store time | < 30 seconds | Strapi API calls |
| Token usage | ~50K tokens | Gemini input + output |
| Cost per sync | ~$0.02 | With gemini-1.5-flash |

## Next Steps

After local testing succeeds:

1. **Deploy to Railway**:
   - Create new Railway service
   - Link to GitHub repo
   - Set environment variables
   - Deploy

2. **Monitor First Production Sync**:
   - Check Railway logs
   - Verify gigs created in Strapi
   - Monitor Gemini API usage

3. **Compare with gig-crawler**:
   - Check data quality
   - Compare number of events found
   - Evaluate cost vs. benefit

4. **Tune Prompts** (if needed):
   - Improve URL filtering accuracy
   - Enhance gig extraction quality
   - Add more examples to prompts

## Support

If you encounter issues:

1. Check logs for detailed error messages
2. Verify all API keys are correct
3. Test individual adapters separately
4. Check Strapi API is accessible
5. Verify Gemini API quota
