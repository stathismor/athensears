"""Prompt template for Pass 1: Filter promising URLs."""

URL_FILTER_PROMPT = """You are helping to find live music events, concerts, and gigs in Athens, Greece.

Below are search results from a web search. Your task is to filter these results and identify the most promising URLs that are likely to contain information about upcoming live music events in Athens.

**Selection Criteria:**
- URLs from known event listing sites (e.g., viva.gr, more.com, ticketservices.gr, etc.)
- URLs with event calendars or "what's on" pages
- URLs from music venues with upcoming shows
- URLs with specific event details (dates, artist names)
- URLs from Athens-based music blogs or news sites

**Exclude:**
- General news sites without specific event listings
- Social media profile pages (unless they have clear event information)
- Ticket resale/marketplace sites
- URLs about past events
- Non-Athens or non-Greece locations

**Search Results:**

{search_results}

**Instructions:**
Select 5-10 of the most promising URLs to scrape. Return your response as a JSON object with this exact structure:

{{
  "promising_urls": [
    "https://example.com/events",
    "https://another-site.gr/calendar"
  ]
}}

Only include URLs that you are confident will contain useful information about upcoming Athens music events.
"""
