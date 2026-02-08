"""Prompt template for Pass 2: Extract gig data."""

GIG_EXTRACTION_PROMPT = """You are extracting structured information about live music events, concerts, and gigs in Athens, Greece from web page content.

**Source URL:** {url}

**Page Content:**

{content}

**Task:**
Extract all upcoming music events from this content. For each event, extract the following fields:

- **title** (required): Name of the event, band/artist name, or concert title
- **date** (required): Event date and time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- **venue_name** (required): Name of the venue where the event takes place
- **description** (optional): Event description, genre, or additional details
- **price** (optional): Ticket price (e.g., "€15", "Free", "€20-€30")
- **image_url** (optional): URL of event poster or image

**Important Guidelines:**
1. Only extract events that are clearly in Athens, Greece
2. Only extract future events (skip past events)
3. If the date is ambiguous or missing, skip that event
4. Use the venue name from the content, not generic descriptions
5. Keep titles concise and clear (band/artist name is enough)
6. If multiple events are listed, extract all of them
7. If no events are found, return an empty array

**Output Format:**
Return your response as a JSON object with this exact structure:

{{
  "gigs": [
    {{
      "title": "Artist Name",
      "date": "2026-02-15T20:00:00",
      "venue_name": "Venue Name",
      "description": "Optional description",
      "price": "€15",
      "image_url": "https://example.com/poster.jpg"
    }}
  ]
}}

Extract all events now:
"""
