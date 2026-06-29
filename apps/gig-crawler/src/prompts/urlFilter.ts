export const URL_FILTER_PROMPT = (
  searchResults: string
) => `You are helping to find live music events, concerts, and gigs in Athens, Greece.

Below are search results from a web search. Your task is to filter these results and identify the most promising URLs that are likely to contain information about upcoming live music events in Athens.

**IMPORTANT - Genre & Taste Focus:**
We are interested in INDIE/CRITICAL music taste — artists reviewed on Pitchfork, Bandcamp, The Quietus, KEXP, NPR Music, Drowned in Sound, etc.

ONLY interested in these genres:
- Rock, Indie Rock, Indie Electronic, Alternative
- Post-rock, Shoegaze
- Synth, Electronic, IDM, Experimental
- Ambient, Noise, Dark, Goth, Post-punk, Industrial
- Modern Classical, Minimalism, Contemporary Classical
- Jazz, Folk, Krautrock

EXCLUDE these genres and sources:
- Mainstream Pop (Greek, international)
- Dance, Techno, House, EDM, Rave
- Hip-hop, Trap, Rap
- Mainstream Metal
- Mainstream/commercial events
- Greek popular music (λαϊκά, έντεχνο)
- Mainstream music news sites (e.g., metalwar.gr, blabbermouth.net)

**Selection Criteria (prioritize in this order):**
1. **Greek event sites** (e.g., ticketservices.gr, athinorama.gr, Athens Voice, lifo.gr, rocking.gr)
2. **Venue websites** from Athens rock/indie/alternative music venues with upcoming shows
3. **Event calendars** or "what's on" pages focused on alternative music
4. **Athens music blogs** or news sites with rock/indie event listings
5. **International event aggregators** (e.g., bandsintown, songkick) - only if no better options

**Exclude:**
- General news sites without specific event listings
- Social media profile pages (unless they have clear event information)
- Ticket resale/marketplace sites
- URLs about past events
- Non-Athens or non-Greece locations
- Pop, dance, or mainstream music venues/events
- Music news/blog sites covering international events (e.g., metalwar.gr, blabbermouth.net) — these publish news articles about worldwide events, not Athens-specific listings

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
