export const GIG_EXTRACTION_BATCH_PROMPT = (
  scrapedPages: Array<{ url: string; content: string }>
) => `You are extracting structured information about live music events, concerts, and gigs in Athens, Greece from multiple web pages.

**Task:**
Extract all upcoming music events from ALL the pages below. For each event, extract the following fields:

- **title** (required): Name of the event, band/artist name, or concert title
- **date** (required): Event date and time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- **venue_name** (required): Name of the venue where the event takes place
- **description** (optional): Event description, genre, or additional details
- **price** (required): Ticket price. MUST be one of:
  - A specific price in euros: "€15", "€20", etc.
  - A price range: "€20-€30"
  - "Free" if the event is free
  - "N/A" if price is not mentioned or unknown
- **image_url** (optional): URL of event poster or image

- **url** (required): The Source URL of the page where this event was found (from the "Source URL:" field above each page)

**Important Guidelines:**
1. Only extract events that are clearly in Athens, Greece
2. Only extract future events (skip past events)
3. If the date is ambiguous or missing, skip that event
4. Use the venue name from the content, not generic descriptions
5. **Title format:** Keep titles concise with ONLY the artist/band name. DO NOT include the venue in the title. If the title contains "@" or "at", remove everything after it. Examples:
   - "Wildfire @ KYTTARO" → "Wildfire"
   - "Band Name at Venue" → "Band Name"
6. **Price format:** Look for ticket prices in the content. Common indicators: "€", "EUR", "euro", "price", "admission", "tickets", "entrance fee". If no price is found, use "N/A"
7. **URL field:** For each event, set "url" to the "Source URL" shown at the top of the page where you found the event
8. Extract events from ALL pages provided
9. If a page has no events, skip it and move to the next
10. Return all events from all pages in a single array
11. **Avoid duplicates:** If the same artist/event appears multiple times with the same date, only extract it once

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
  .join('\n')}

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
