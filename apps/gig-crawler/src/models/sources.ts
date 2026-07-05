/**
 * Curated source registry - the backbone of discovery.
 *
 * Instead of open-web search (which returns SEO spam, aggregators and mainstream
 * pop), the crawler walks this hand-maintained list of known Athens venues and
 * ticketing pages. This makes each nightly run deterministic, cheap and high
 * signal. To add a venue, add an entry here.
 *
 * Each source exposes one or more `listingUrls` - pages that list UPCOMING events.
 * For `type: "venue"` sources we already know the venue, so `venueName` is stamped
 * onto every gig extracted from it (this eliminates venue-name drift / duplicate
 * venues). For `type: "aggregator"` sources the venue varies per event, so it is
 * extracted by the LLM and normalised via `normalizeVenueName()`.
 *
 * URLs were verified on 2026-06-29. Only enable a source whose listing page was
 * confirmed to load and show upcoming events - a dead listing URL silently drops a
 * whole venue. Unverified/stale/blocked ones are left `enabled: false` with a note.
 */
export interface GigSource {
  /** stable slug, e.g. "gagarin-205" */
  id: string;
  /** canonical source/venue name */
  name: string;
  type: "venue" | "aggregator";
  /** page(s) that list upcoming events */
  listingUrls: string[];
  /** for type:"venue" - assigned to every gig from this source */
  venueName?: string;
  /** for venue sources - Athens neighborhood (e.g. "Gazi", "Exarchia") */
  neighborhood?: string;
  /** venue official homepage, used as a fallback link on the site */
  website?: string;
  /**
   * Extract gigs straight from the listing page(s), skipping detail-page discovery.
   * Use when the listing already lists events inline AND/OR the detail pages are
   * gated (e.g. more.com event pages sit behind a Queue-It waiting room).
   */
  listingOnly?: boolean;
  /** sources default to enabled; set false to skip without deleting the entry */
  enabled?: boolean;
}

export const GIG_SOURCES: GigSource[] = [
  // ───────────── Venues with clean, verified official event pages ─────────────
  {
    id: "gagarin-205",
    name: "Gagarin 205",
    type: "venue",
    venueName: "Gagarin 205",
    neighborhood: "Kato Patisia",
    website: "https://gagarin205.gr",
    listingUrls: ["https://gagarin205.gr/events/"],
  },
  {
    id: "an-club",
    name: "AN Club",
    type: "venue",
    venueName: "AN Club",
    neighborhood: "Exarchia",
    website: "https://www.anclub.gr",
    listingUrls: ["https://www.anclub.gr/events"],
  },
  {
    id: "fuzz-club",
    name: "Fuzz Club",
    type: "venue",
    venueName: "Fuzz Club",
    neighborhood: "Tavros",
    website: "https://www.fuzzclub.gr",
    listingUrls: ["https://www.fuzzclub.gr/events/list/"],
  },
  {
    id: "gazarte",
    name: "Gazarte",
    type: "venue",
    venueName: "Gazarte",
    neighborhood: "Gazi",
    website: "https://www.gazarte.gr",
    // Broad programming (jazz/world/indie) - leans on the taste filter.
    listingUrls: ["https://www.gazarte.gr/en/cultural/"],
  },
  {
    id: "floyd",
    name: "Floyd",
    type: "venue",
    venueName: "Floyd",
    neighborhood: "Keramikos",
    website: "https://www.floyd.gr",
    listingUrls: ["https://www.floyd.gr/events/category/concerts/"],
  },
  {
    // Major Athens summer festival at Plateia Nerou. Clean per-event detail pages
    // (/event/<slug>/), verified scrapeable over HTTP 2026-06-29. Aggregators list
    // these as "Plateia Nerou" - aliased to "Release Athens" so the copies merge.
    id: "release-athens",
    name: "Release Athens (Plateia Nerou)",
    type: "venue",
    venueName: "Release Athens",
    neighborhood: "Palaio Faliro",
    website: "https://www.releaseathens.gr",
    listingUrls: ["https://www.releaseathens.gr/en/"],
  },

  // ───────── Venues with no usable official page - verified via aggregator ─────────
  // listingUrl is a venue-scoped aggregator page; venueName is stamped so the venue
  // is always correct regardless of how the aggregator labels it.
  {
    id: "death-disco",
    name: "Death Disco",
    type: "venue",
    venueName: "Death Disco",
    neighborhood: "Psyrri",
    // Official site has no schedule (FB/IG only); allevents is machine-readable.
    listingUrls: ["https://allevents.in/athens/death%20disco"],
  },
  {
    id: "temple",
    name: "Temple",
    type: "venue",
    venueName: "Temple",
    neighborhood: "Keramikos",
    // thetemple.gr DNS is dead; schedule lives on FB. allevents lists upcoming shows.
    listingUrls: ["https://allevents.in/athens/temple"],
  },
  {
    id: "ilion-plus",
    name: "Ilion Plus",
    type: "venue",
    venueName: "Ilion Plus",
    neighborhood: "Kypseli",
    // No functional official site; Songkick venue page has verified upcoming events.
    listingUrls: ["https://www.songkick.com/venues/3229234-ilion-plus"],
  },

  // ───────────────────────── Ticketing / listing aggregators ─────────────────────────
  // These carry everything (pop, comedy, theatre, kids' shows), so they lean
  // hardest on the strict taste filter in the extraction prompt.
  {
    // Verified in the previous implementation and re-verified 2026-06-29.
    id: "ticketservices",
    name: "Ticket Services - Live Concerts",
    type: "aggregator",
    listingUrls: ["https://www.ticketservices.gr/en/LiveConcerts/"],
  },
  {
    // Editorial Athens concert agenda with the best area/genre filtering.
    id: "athinorama",
    name: "Athinorama - Music Guide",
    type: "aggregator",
    listingUrls: ["https://www.athinorama.gr/music/guide"],
  },
  {
    // Bios group's unified events page - covers Bios.Romantso, Bios.Pireos84, PLEX.
    // Treated as an aggregator so the per-event sub-venue is extracted + normalised
    // (avoids double-stamping the shared page as a single venue).
    id: "bios-group",
    name: "Bios - Romantso / Pireos84 / PLEX",
    type: "aggregator",
    listingUrls: ["https://bios.gr/bios/tickets/"],
  },
  {
    // Major aggregator (viva.gr merged into it). The music listing is open over
    // plain HTTP (handled by the scraper's http-first path), but individual event
    // pages sit behind a Queue-It waiting room, so we extract from the listing only.
    id: "more-com",
    name: "more.com - Music",
    type: "aggregator",
    listingUrls: ["https://www.more.com/gr-en/tickets/music/"],
    listingOnly: true,
  },

  // ─────────────────── Disabled pending a usable/verified listing URL ───────────────────
  {
    id: "kyttaro",
    name: "Kyttaro",
    type: "venue",
    venueName: "Kyttaro",
    neighborhood: "Victoria",
    website: "https://www.kyttarolive.gr",
    // Official /upcoming-events/ is stale (2024); real events only on Songkick/FB.
    // TODO: point at a verified Songkick venue URL, then enable.
    listingUrls: ["https://www.kyttarolive.gr/upcoming-events/"],
    enabled: false,
  },
  {
    id: "six-dogs",
    name: "Six Dogs",
    type: "venue",
    venueName: "Six Dogs",
    neighborhood: "Monastiraki",
    website: "https://sixdogs.gr",
    // /calendar is the agenda but Cloudflare returns 403 to plain fetch. Our
    // Playwright is a real browser and may pass - try enabling and watch the logs.
    listingUrls: ["https://sixdogs.gr/calendar"],
    enabled: false,
  },
  {
    id: "piraeus-club-academy",
    name: "Piraeus Club Academy",
    type: "venue",
    venueName: "Piraeus Club Academy",
    neighborhood: "Rouf",
    // JS-heavy homepage; only past events extracted. athinorama hall page is a
    // reliable alternative: athinorama.gr/music/halls/piraeus_club_academy-10011615/
    listingUrls: ["https://www.piraeusclubacademy.gr/"],
    enabled: false,
  },
  {
    id: "faust",
    name: "Faust",
    type: "venue",
    venueName: "Faust",
    neighborhood: "Monastiraki",
    // faust.gr DNS currently broken; venue reportedly resumes mid-September (FB only).
    listingUrls: ["https://www.faust.gr/all-music-events/"],
    enabled: false,
  },
];

/** Sources that should be crawled this run (enabled unless explicitly disabled). */
export function activeSources(): GigSource[] {
  return GIG_SOURCES.filter((s) => s.enabled !== false);
}
