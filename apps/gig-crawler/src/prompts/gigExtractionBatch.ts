import { ACTIVE_CITY } from "../models/city.js";

export const GIG_EXTRACTION_BATCH_PROMPT = (
  scrapedPages: Array<{ url: string; content: string }>,
  dateRange?: { startDate: string; endDate: string }
) => `You are extracting structured information about live music events, concerts, and gigs in ${ACTIVE_CITY.name} from multiple web pages.
${dateRange ? `\n**Date Range:** Only extract events between ${dateRange.startDate} and ${dateRange.endDate}. Skip any events outside this range.\n` : ""}

**CRITICAL - Taste Filter (this is a strictly curated indie/alternative listing):**
KEEP events whose music clearly fits one of these (set "genre" to the closest match):
- Rock, Indie Rock, Indie Pop, Alternative, Garage
- Post-rock, Shoegaze, Dream Pop, Math Rock
- Post-punk, Punk, Hardcore, Noise, Industrial
- Metal, Doom, Sludge, Stoner, Black Metal, Death Metal (real metal shows, not pop-metal)
- Dark, Goth, Darkwave, Coldwave, EBM
- Synth, Electronic-experimental, IDM, Krautrock, Ambient, Drone
- Modern/Contemporary Classical, Minimalism
- Jazz, Free Jazz, Folk, Singer-songwriter, Psych, Prog
- Reggae, Dub, Ska, World/roots - when played live by a band (NOT club DJ nights)

REJECT (do NOT include - set "genre" to "reject" or simply omit the event):
- Mainstream / commercial pop (Greek or international)
- Greek popular/laïko/éntechno/skyladiko (λαϊκά, έντεχνο, σκυλάδικα, ελληνικό pop). Greek λαϊκό/ρεμπέτικο/tavern-style programs are NEVER "Folk" - Folk in the KEEP list means indie/acoustic singer-songwriter folk
- Commercial dance/EDM, club DJ nights, techno/house party nights, "mainstream" rave
- DJ sets, club or beach-club residencies and summer party series - any event whose headliner performs a DJ set at a club/beach/restaurant venue, however credible the DJ
- Event-format nights with no named performing act: open decks, jam sessions, listening or dance parties, participatory synth/vinyl nights
- Mainstream or pop artists performing a themed/covers program (e.g. pop singers doing a "shades of rock" show) - the theme does not change what the artist is
- Tribute bands, cover bands, "the music of X" gala nights
- Stand-up comedy, theatre, musicals, opera galas, kids'/family shows
- Corporate/branded events, talent shows, TV-personality concerts

**Label the artist, not the blurb.** The genre must describe the performing act's own body
of work. Marketing copy borrows genre words ("a night of rock", "electronic vibes") - never
classify an event by those; classify by what the performer is actually known for.

When in doubt about whether something is curated indie taste vs. mainstream, REJECT it.

**Task:**
Extract all upcoming music events from ALL the pages below that match the genre criteria. For each event, extract the following fields:

- **title** (required): Name of the event, band/artist name, or concert title
- **date** (required): Event date and time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- **venue_name** (required): Name of the venue where the event takes place
- **genre** (required): The act's TRUE genre(s) from the KEEP list above - up to 3, comma-separated, MOST relevant first (e.g. "Post-rock, Shoegaze" or just "Metal"). Label accurately - do NOT shoehorn an act into an unrelated bucket (e.g. a reggae/dub act is "Reggae", never "Folk"). If the event does NOT fit the KEEP list at all, set this to "reject" (the event will be discarded)
- **description** (optional): Event description, supporting acts, or additional details
- **price** (required): Ticket price. Return ONLY the minimum/starting price as a single value "€X" (e.g. "€15"). If multiple prices are listed (e.g. "€16, 18€, 20€"), return only the lowest one as "€16". Never return a list or comma-separated prices. Use:
  - "€X" for a specific price
  - "Free" if the event is free
  - "N/A" if price is not mentioned or unknown
- **ticket_url** (optional): Full URL to the specific event's ticket page. Must be a complete URL with path (e.g. https://www.ticketservices.gr/event/artist-name-12345/). Do NOT return bare domains like "more.com". Omit if no specific event URL is found.
- **image_url** (optional): URL of event poster or image

- **url** (required): The Source URL of the page where this event was found (from the "Source URL:" field above each page)

**Important Guidelines:**
1. **${ACTIVE_CITY.name}-only rule (STRICT):** ONLY extract events that EXPLICITLY take place in ${ACTIVE_CITY.name} (${ACTIVE_CITY.nameAliases.join(", ")}). The page MUST mention ${ACTIVE_CITY.name} OR a known ${ACTIVE_CITY.name} venue. If the page does not mention any city, or mentions ANY other city, produce ZERO events from that page. When in doubt, skip
2. Only extract future events (skip past events)
3. **Date accuracy (STRICT):** If the page does NOT show a specific day AND month for an event, produce ZERO events from that page. NEVER guess, infer, or default to today's date. A year alone (e.g. "2026") is NOT a valid date. A month alone (e.g. "July") is NOT a valid date. You need at minimum a day and month (e.g. "5 July", "05/07/2026")
4. Use the venue name from the content, not generic descriptions
5. **Title format:** The title must be ONLY the act's name (artist/band, or the festival/event name for multi-band bills). Strip everything the source appended around it:
   - venue or location ("@ X", "at X", "στο/στη X", "live in ${ACTIVE_CITY.name}")
   - dates in any form, numeric or written out, any language ("2/10", "Σάββατο 19 Σεπτεμβρίου", "Saturday 19 September 2026")
   - subtitles and tags: tour/show/album names in quotes, anniversary tags, country tags ("(US)"), "live", "presents", edition numbers ("vol. 4")
   - leftover separators at the start/end (":", "-", "|", ",")
   Examples:
   - "Wildfire @ KYTTARO" → "Wildfire"
   - "Groove Therapist & Daenoma Σάββατο 19 Σεπτεμβρίου" → "Groove Therapist & Daenoma"
   - 'Kawir: 30 Years "To Cavirs":' → "Kawir"
   - "MONSIEUR MINIMAL 'Μουσικός Δείπνος' live" → "Monsieur Minimal"
   Keep co-headline bills intact: "Megadeth / Sepultura" stays "Megadeth / Sepultura"
6. **Price format:** Return only the minimum/starting price as "€X". If you see multiple prices, pick the lowest. Common indicators: "€", "EUR", "euro", "price", "admission", "tickets", "entrance fee". If no price is found, use "N/A"
7. **Ticket links:** Look for full ticket purchase URLs (not bare domains). Only include a ticket_url if you find a complete URL with a path to the specific event page
8. **URL field:** For each event, set "url" to the "Source URL" shown at the top of the page where you found the event
9. Extract events from ALL pages provided
10. If a page has no events, still include its entry with an empty "gigs" array
11. Group the events by the page they came from (see Output Format)
12. **Avoid duplicates:** If the same artist/event appears multiple times with the same date, only extract it once
13. **Multi-band/festival events:** If a page describes a single event (e.g. a festival day, a multi-band concert) with multiple bands performing, extract it as ONE event. Use the event/festival name as the title, and list the performing bands in the description. Do NOT create a separate event for each band
14. **Date accuracy:** When a page lists multiple events, carefully match each event's date to that specific event. Do not mix dates between events. For Songkick pages, the date is shown prominently at the top of each event page - use that date, not dates from sidebar or related events. Greek dates use month names like Ιανουαρίου, Φεβρουαρίου, Μαρτίου, Απριλίου, Μαΐου, Ιουνίου, Ιουλίου, Αυγούστου, Σεπτεμβρίου, Οκτωβρίου, Νοεμβρίου, Δεκεμβρίου - parse these carefully. If two sources show different dates for the same event, prefer the venue's own website
15. **News article rejection:** If a page is a NEWS ARTICLE (album announcement, tour announcement, festival recap, review) rather than an event listing/detail page, produce ZERO events from it. Do NOT extract dates from news context (album release dates, festival dates abroad) as Athens concert dates
16. **Artist credibility filter:** Prefer artists with meaningful coverage on credible indie music publications (Pitchfork, Bandcamp, The Quietus, KEXP, Drowned in Sound, NPR Music, etc.) or artists known to play at respected indie venues/festivals. Skip one-off local acts or no-name bedroom producers with zero track record. This is soft guidance - if unsure, extract anyway

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
Return your response as a JSON object with this exact structure. Include one entry
per page (using the PAGE number shown above each page), with that page's events in
its "gigs" array. A page with no matching events MUST still appear with "gigs": [].

{
  "results": [
    {
      "page": 1,
      "gigs": [
        {
          "title": "Artist Name",
          "date": "2026-02-15T20:00:00",
          "venue_name": "Venue Name",
          "genre": "Post-rock, Shoegaze",
          "description": "Rock band from London, support by Local Act",
          "price": "€15",
          "url": "https://source-page-url.com",
          "image_url": "https://example.com/poster.jpg"
        }
      ]
    },
    {
      "page": 2,
      "gigs": []
    }
  ]
}

Extract all events from all pages now:`;
