export const GIG_EXTRACTION_BATCH_PROMPT = (
  scrapedPages: Array<{ url: string; content: string }>,
  dateRange?: { startDate: string; endDate: string }
) => `You are extracting structured information about live music events, concerts, and gigs in Athens, Greece from multiple web pages.
${dateRange ? `\n**Date Range:** Only extract events between ${dateRange.startDate} and ${dateRange.endDate}. Skip any events outside this range.\n` : ""}

**CRITICAL - Genre Filter:**
ONLY extract events from these genres:
- Rock, Metal, Indie, Alternative
- Folk, Post-rock, Shoegaze
- Dark, Goth, Post-punk
- Experimental, Noise, Ambient, Jazz

SKIP events from these genres:
- Pop (Greek or international)
- Dance, Techno, House, Rave, EDM
- Hip-hop, Trap, Rap
- Greek popular music (λαϊκά, έντεχνο, ελληνικό pop)
- Mainstream/commercial pop acts

**Task:**
Extract all upcoming music events from ALL the pages below that match the genre criteria. For each event, extract the following fields:

- **title** (required): Name of the event, band/artist name, or concert title
- **date** (required): Event date and time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- **venue_name** (required): Name of the venue where the event takes place
- **description** (optional): Event description, genre, or additional details
- **price** (required): Ticket price. Return ONLY the minimum/starting price as a single value "€X" (e.g. "€15"). If multiple prices are listed (e.g. "€16, 18€, 20€"), return only the lowest one as "€16". Never return a list or comma-separated prices. Use:
  - "€X" for a specific price
  - "Free" if the event is free
  - "N/A" if price is not mentioned or unknown
- **ticket_url** (optional): Full URL to the specific event's ticket page. Must be a complete URL with path (e.g. https://www.more.com/music/concerts/artist-name-12345/). Do NOT return bare domains like "more.com". Omit if no specific event URL is found.
- **image_url** (optional): URL of event poster or image

- **url** (required): The Source URL of the page where this event was found (from the "Source URL:" field above each page)

**Important Guidelines:**
1. ONLY extract events in Athens, Greece. SKIP events in Thessaloniki, Patras, or any other city. If the venue or location mentions a city other than Athens, skip it
2. Only extract future events (skip past events)
3. If the date is ambiguous or missing, skip that event
4. Use the venue name from the content, not generic descriptions
5. **Title format:** Keep titles concise with ONLY the artist/band name. DO NOT include the venue in the title. If the title contains "@" or "at", remove everything after it. Examples:
   - "Wildfire @ KYTTARO" → "Wildfire"
   - "Band Name at Venue" → "Band Name"
6. **Price format:** Return only the minimum/starting price as "€X". If you see multiple prices, pick the lowest. Common indicators: "€", "EUR", "euro", "price", "admission", "tickets", "entrance fee". If no price is found, use "N/A"
7. **Ticket links:** Look for full ticket purchase URLs (not bare domains). Only include a ticket_url if you find a complete URL with a path to the specific event page
8. **URL field:** For each event, set "url" to the "Source URL" shown at the top of the page where you found the event
9. Extract events from ALL pages provided
10. If a page has no events, skip it and move to the next
11. Return all events from all pages in a single array
12. **Avoid duplicates:** If the same artist/event appears multiple times with the same date, only extract it once
13. **Multi-band/festival events:** If a page describes a single event (e.g. a festival day, a multi-band concert) with multiple bands performing, extract it as ONE event. Use the event/festival name as the title, and list the performing bands in the description. Do NOT create a separate event for each band
14. **Date accuracy:** When a page lists multiple events, carefully match each event's date to that specific event. Do not mix dates between events. For Songkick pages, the date is shown prominently at the top of each event page — use that date, not dates from sidebar or related events

**Pages to Extract From:**

${scrapedPages
  .map(
    (page, index) => `
--- PAGE ${index + 1} ---
Source URL: ${page.url}

Content:
${page.content.slice(0, 15000)}

---
`
  )
  .join("\n")}

**Output Format:**
Return your response as a JSON object with this exact structure:

{
  "gigs": [
    {
      "title": "Artist Name",
      "date": "2026-02-15T20:00:00",
      "venue_name": "Venue Name",
      "description": "Rock band from London",
      "price": "€15",
      "url": "https://source-page-url.com",
      "image_url": "https://example.com/poster.jpg"
    },
    {
      "title": "Another Artist",
      "date": "2026-02-16T21:00:00",
      "venue_name": "Another Venue",
      "description": "Jazz night",
      "price": "Free",
      "url": "https://another-source-page.com"
    }
  ]
}

Extract all events from all pages now:`;
