export const GIG_EXTRACTION_PROMPT = (
  url: string,
  content: string
) => `You are extracting structured information about live music events, concerts, and gigs in Athens, Greece from web page content.

**Source URL:** ${url}

**Page Content:**

${content}

**Task:**
Extract all upcoming music events from this content. For each event, extract the following fields:

- **title** (required): Name of the event, band/artist name, or concert title
- **date** (required): Event date and time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- **venue_name** (required): Name of the venue where the event takes place
- **description** (optional): Event description, genre, or additional details
- **price** (required): Ticket price. MUST be one of:
  - A specific price in euros: "€15", "€20", etc.
  - A price range: "€20-€30"
  - "Free" if the event is free
  - "N/A" if price is not mentioned or unknown
- **url** (required): Use the Source URL provided above
- **image_url** (optional): URL of event poster or image

**Important Guidelines:**
1. Only extract events that are clearly in Athens, Greece
2. Only extract future events (skip past events)
3. If the date is ambiguous or missing, skip that event
4. Use the venue name from the content, not generic descriptions
5. **Title format:** Keep titles concise with ONLY the artist/band name. DO NOT include the venue in the title. If the title contains "@" or "at", remove everything after it. Examples:
   - "Wildfire @ KYTTARO" → "Wildfire"
   - "Giorgos Magos @ Το Μεζεκλίκι" → "Giorgos Magos"
   - "Band Name at Venue" → "Band Name"
6. **Price format:** Look for ticket prices in the content. Common indicators: "€", "EUR", "euro", "price", "admission", "tickets", "entrance fee". If no price is found, use "N/A"
7. If multiple events are listed, extract all of them
8. If no events are found, return an empty array
9. **Avoid duplicates:** If the same artist/event appears multiple times with the same date, only extract it once

**Output Format:**
Return your response as a JSON object with this exact structure:

{
  "gigs": [
    {
      "title": "Artist Name",
      "date": "2026-02-15T20:00:00",
      "venue_name": "Venue Name",
      "description": "Optional description",
      "price": "€15",
      "image_url": "https://example.com/poster.jpg"
    }
  ]
}

Extract all events now:`;
