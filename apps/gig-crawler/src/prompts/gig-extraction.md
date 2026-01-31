# Gig Extraction Prompt

This prompt is used with Brave AI Grounding API to search for and extract Athens music event data.

## Variables

- `{{startDate}}` - Start date in YYYY-MM-DD format
- `{{endDate}}` - End date in YYYY-MM-DD format

## Prompt

Search the web for upcoming live music events, concerts, and gigs in Athens, Greece from {{startDate}} to {{endDate}}.

Find 5-10 events and return them as a JSON array with this format:
```json
[
  {
    "title": "Event name",
    "date": "YYYY-MM-DD format",
    "venue": "Venue name and location",
    "price": "Ticket price with € symbol"
  }
]
```

## Requirements

- Only include confirmed upcoming events starting from {{startDate}} onwards
- Events must be in Athens, Greece
- Include: concerts, live music, DJ sets, band performances
- Date format: YYYY-MM-DD (e.g., "2026-02-15")
- Return ONLY the JSON array, no other text

## Example Output

```json
[{"title":"Jazz Night","date":"2026-02-01","venue":"Six Dogs, Monastiraki","price":"€10"}]
```
