# Gig Crawler Architecture

**Updated:** 2026-01-28 - Refactored to use Brave AI Grounding API

## Overview

The gig crawler is an automated service that discovers Athens live music events on the web and populates the Strapi CMS.

## Architecture Decision: Brave AI Grounding API

After evaluating multiple approaches, we chose **Brave AI Grounding API** for its simplicity and cost-effectiveness.

### Why Brave AI Grounding?

**Original approach (rejected):**
```
SerpAPI (search) → Crawler (scrape pages) → Groq LLM (extract) → Strapi CMS
```

**Problems:**
- Multiple API calls per sync
- Complex error handling across 3 services
- Slower execution time
- More points of failure

**Current approach (Brave AI):**
```
Brave AI Grounding API (search + extract) → Strapi CMS
```

**Benefits:**
✅ Single API call combines search + AI extraction
✅ Simpler architecture (fewer moving parts)
✅ 2,000-5,000 free queries/month (plenty for nightly sync)
✅ Built-in web grounding (reduces hallucinations)
✅ OpenAI-compatible API (familiar interface)
✅ If free tier exceeded: $5/1,000 queries (affordable)

## Data Flow

```
┌─────────────────┐
│  Cron Scheduler │  Triggers nightly at 2 AM Athens time
└────────┬────────┘
         │
         ▼
┌────────────────────────────────────────────┐
│  Brave AI Grounding API                    │
│  ─────────────────────────────────────────│
│  Prompt: "Find Athens Greece live music   │
│  events with venue, date, price..."       │
│                                            │
│  Returns: Structured JSON with gigs       │
└────────┬───────────────────────────────────┘
         │
         ▼
┌────────────────────┐
│  Validation Layer  │  Validate dates, required fields, schema
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Venue Matcher     │  Match or create venues
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Deduplication     │  Check if gig already exists (title + date)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Strapi CMS API    │  Create gigs and venues
└────────────────────┘
```

## API Request Example

```typescript
POST https://api.search.brave.com/res/v1/chat/completions

Headers:
  x-subscription-token: <BRAVE_API_KEY>
  Content-Type: application/json

Body:
{
  "model": "brave",
  "messages": [
    {
      "role": "system",
      "content": "You are a data extraction specialist..."
    },
    {
      "role": "user",
      "content": "Search for Athens Greece live music events..."
    }
  ],
  "stream": false
}
```

## Response Format

Brave AI returns structured text with special tags:

```
Here are the upcoming Athens music events:

[
  {
    "title": "Jazz Night at Six Dogs",
    "date": "2026-02-15T21:00:00Z",
    ...
  }
]

<citation>{"index":1,"url":"https://..."}</citation>
```

Our parser:
1. Removes citation/usage tags
2. Extracts JSON array
3. Validates against schema
4. Filters past events

## Schema Mapping

**Brave AI Output → Strapi CMS:**

```typescript
{
  title: string,              // → gig.title (max 255 chars)
  date: string (ISO),         // → gig.date (ISO datetime)
  time_display: string,       // → gig.time_display (max 20 chars)
  price: string,              // → gig.price (max 50 chars)
  description: string,        // → gig.description (text)
  venue: {
    name: string,             // → venue.name (required, max 255)
    address: string,          // → venue.address (text)
    website: string,          // → venue.website (max 500)
    neighborhood: string      // → venue.neighborhood (max 100)
  }
}
```

## Error Handling

**API Failures:**
- 401 Unauthorized → Invalid API key (exit sync)
- 429 Rate Limit → Retry with exponential backoff
- 500 Server Error → Retry up to 3 times
- Network timeout → Retry up to 3 times

**Data Validation:**
- Missing required fields → Skip gig, log warning
- Invalid date format → Skip gig, log warning
- Past date → Skip gig (only future events)
- String length violations → Truncate to max length

**Strapi API Failures:**
- Venue creation fails → Retry up to 3 times
- Gig creation fails → Retry up to 3 times
- Duplicate gig → Skip, increment duplicate counter

## Deployment

**Development (Docker):**
- Hot reload with mounted volumes
- Debug logging enabled
- Cron disabled by default (manual trigger only)

**Production (Railway):**
- Multi-stage Docker build
- Production dependencies only
- Cron runs nightly at 2 AM
- Info-level logging

## Cost Analysis

**Free Tier (Current Usage):**
- Brave AI: 30 queries/month (2,000-5,000 limit) → **$0**
- Railway: < 500 hours/month → **$0**
- Strapi: Included in Railway → **$0**

**Total: $0/month**

**If Exceeded:**
- Brave AI paid: $5/1,000 queries
- For daily sync: 365 queries/year = $1.83/year
- Still very affordable!

## Alternatives Considered

| Solution | Cost | Pros | Cons |
|----------|------|------|------|
| SerpAPI + Groq | $0 | Separate concerns | Complex, multiple APIs |
| Brave Search + Groq | $0 | Good for high volume | Need to combine 2 APIs |
| **Brave AI Grounding** | **$0** | **Simple, all-in-one** | **Requires credit card** |
| Perplexity API | ~$5-20/mo | Great results | Unclear free tier |
| Gemini + Google Search | $35/1K queries | High quality | Too expensive |

## Future Enhancements

Potential improvements:
- [ ] Add user-curated venue list for better matching
- [ ] Support manual URL submission for specific events
- [ ] Email digest of newly discovered gigs
- [ ] Integration with ticketing platforms
- [ ] Event image extraction
- [ ] Social media sharing automation

## Sources

- [Brave AI Grounding API](https://brave.com/blog/ai-grounding/)
- [Brave AI Documentation](https://api-dashboard.search.brave.com/app/documentation/ai-grounding)
- [Brave AI Pricing](https://www.searchenginejournal.com/brave-announces-ai-grounding-api/553347/)
