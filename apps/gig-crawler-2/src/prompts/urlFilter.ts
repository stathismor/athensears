export const URL_FILTER_PROMPT = (searchResults: string) => `You are helping to find live music events, concerts, and gigs in Athens, Greece.

Below are search results from a web search. Your task is to filter these results and identify the most promising URLs that are likely to contain information about upcoming live music events in Athens.

**Selection Criteria (prioritize in this order):**
1. **Greek event sites** (e.g., viva.gr, more.com, ticketservices.gr, Athens Voice, lifo.gr)
2. **Venue websites** from Athens music venues with upcoming shows
3. **Event calendars** or "what's on" pages
4. **Athens music blogs** or news sites with event listings
5. **International event aggregators** (e.g., bandsintown, songkick) - only if no better options

**Exclude:**
- General news sites without specific event listings
- Social media profile pages (unless they have clear event information)
- Ticket resale/marketplace sites
- URLs about past events
- Non-Athens or non-Greece locations

**Diversity:** Try to select URLs from different sources to maximize variety of events found.

**Search Results:**

${searchResults}

**Instructions:**
Select 5-10 of the most promising URLs to scrape. Return your response as a JSON object with this exact structure:

{
  "promising_urls": [
    "https://example.com/events",
    "https://another-site.gr/calendar"
  ]
}

Only include URLs that you are confident will contain useful information about upcoming Athens music events.`;
