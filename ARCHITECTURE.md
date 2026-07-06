# Architecture

## What Athens Ears is

Athens Ears is a curated listing of upcoming live music in Athens, Greece. It has a
deliberate editorial taste: it keeps rock, indie, alternative, post-punk, punk, metal,
post-rock, shoegaze, dark/goth, experimental/electronic, contemporary classical, jazz,
folk and adjacent genres, and it strictly excludes mainstream pop, commercial EDM and
club DJ nights, hip-hop, Greek popular music, tribute/cover acts, and comedy/theatre.

Every night an automated crawler visits a hand-picked set of Athens venues and ticketing
pages, extracts the gigs that fit the taste, and publishes them to a public website. The
listing maintains itself, but a human can override or protect any individual entry.

## System at a glance

Three applications plus a database, kept in one pnpm workspace monorepo:

- **Gig Crawler** - discovers, extracts, filters and stores gigs on a nightly schedule.
- **CMS** - a headless content system that stores venues and gigs and serves them over a REST API.
- **Web** - a server-rendered site that reads from the CMS and shows upcoming gigs.
- **PostgreSQL** - the single system of record behind the CMS.

```
  curated sources                          public visitor
        │                                        ▲
        ▼                                        │
  ┌───────────┐   writes   ┌───────────┐  reads  ┌───────────┐
  │  Crawler  │ ─────────▶ │    CMS    │ ◀─────── │    Web    │
  └───────────┘   (REST)   └───────────┘  (REST)  └───────────┘
        │                        │
        │ uses                   ▼
        ▼                  ┌────────────┐
  browser + LLM            │ PostgreSQL │
                           └────────────┘
```

The crawler only writes. The web app only reads. The CMS is the boundary between them
and the single source of truth. The two never talk to each other directly, so the site
keeps serving the last good data even while a crawl is running or failing.

## Components

### Gig Crawler

A long-running Node service with two jobs:

- **A scheduled sync** that runs nightly (02:00 Athens time by default) and does the full
  discover-extract-filter-store pipeline described below.
- **A small HTTP surface** for operating it: a health check, a manual sync trigger, a sync
  status probe, and a safe (dry-run by default) bulk-delete endpoint. The sync and delete
  endpoints can be protected by a shared bearer token when one is configured.

Discovery is driven by a **curated source registry**, not open-web search. Each source is
a known Athens venue or a ticketing aggregator, described by one or more listing-page URLs
plus metadata (type, canonical venue name, neighborhood, website, and a few behavior
flags). Walking a hand-maintained list rather than searching the web is what makes each
run deterministic, cheap and high-signal, and it means noise never enters in the first
place. Adding a venue is a one-line registry entry; a source can be disabled without
deleting it.

The crawler leans on three external capabilities, each hidden behind an internal port so
the core logic never depends on a concrete vendor:

| Capability | Provided by | Purpose |
|---|---|---|
| Page scraping | A headless browser, with a plain-HTTP fallback | Fetch listing and event pages, extract links, text, and structured metadata |
| Language model | Google Gemini (a cheap "flash-lite" tier by default) | Pick event-detail links out of a page, and extract + taste-filter + genre-label structured gigs |
| Storage | The CMS REST API | Read/write venues, gigs, and the crawler's own cache |

### CMS

A headless content system backed by PostgreSQL. It holds three content types:

- **Gig** - title, date/time, an optional display time, price, description, ticket URL,
  a list of genres, a `manual` flag, and a relation to a venue.
- **Venue** - name, address, website, and Athens neighborhood.
- **Crawl Cache** - a single internal record holding one JSON blob: the crawler's
  extraction cache. It is written by the crawler and is not meant to be edited by hand.

On startup the CMS grants public read access to gigs and venues (so the website can read
them without a token), normalizes any legacy records that predate the current schema, and
can optionally seed demo data into an empty database (off by default, so a fresh
production deploy stays empty until the first crawl). Writes require the crawler's API
token. A custom bulk-delete endpoint supports cleanup of automatically-created gigs.

### Web

A server-rendered site. On every request it fetches the upcoming gigs from the CMS
(future dates only, sorted by date), groups them by month, and renders a responsive
listing. Because it renders live rather than at build time, new nightly gigs and manual
edits appear immediately with no rebuild. A short cache header keeps the CMS from being
hit on every single request while still staying fresh. For its server-side fetch it
prefers a private-network internal URL and falls back to the public URL.

### PostgreSQL

The persistent store behind the CMS. It holds everything: venues, gigs, and the crawler's
extraction cache. There are no separate files, volumes, or caches to manage.

## The nightly sync

A run walks the enabled sources, several at a time, and each source is handled in two
passes before the results are merged and written.

**Pass A - discovery.** The source's listing page(s) are scraped. Two shapes exist:

- **Structured-listing sources** (currently more.com) embed machine-readable event data
  directly in the listing HTML. These are parsed deterministically - no language model, no
  guessing - reading each event's date, title, venue, link, image and genre tags straight
  from the markup. This is faster, cheaper and more reliable than the LLM path.
- **Everything else** discovers individual event-detail pages by asking the language model
  which of a listing page's links are real event pages (versus navigation, calendars,
  category pages or news articles), then scrapes those detail pages. The number of detail
  pages per source is capped to bound cost and time.

Some sources are listing-only (their detail pages are gated or the listing already carries
everything inline), so discovery is skipped and gigs come straight from the listing.

**Pass B - extraction and filtering.** The scraped pages are handed to the language model,
which extracts structured gigs and applies the editorial taste filter in one step,
labelling each kept act with up to three genres and rejecting anything out of taste. For
venue sources, the registry's known canonical venue name is stamped onto every gig, which
eliminates venue-name drift. For aggregator sources the venue varies per event, so it is
extracted and then normalized against an alias map.

Two refinements run around Pass B:

- **Escalation of coarsely-tagged events.** A structured source with a coarse genre
  vocabulary buries genuinely interesting acts under a generic "other" tag. Those specific
  events are escalated to the language model, which classifies them properly and drops the
  actual junk. This recovers curated acts the source's own tagging would hide.
- **Price backfill.** When extraction finds no price for a gig that has a specific event
  page, a deterministic extractor pulls the price from that page's structured data (no
  language model involved), reusing already-fetched HTML where possible.

**Merge and write.** Once every source has produced gigs:

1. **Deduplication** collapses the same event surfaced by multiple sources, in three
   passes: an exact match on normalized-title + day + canonical-venue; a collapse of a
   billing that is a subset of a fuller one on the same night at the same venue (so
   "Megadeth" folds into "Megadeth / Sepultura"); and a collapse of a recurring series
   listed once per date under one shared event page into a single upcoming entry. Merging
   keeps the record with the most specific link and backfills any missing price,
   description, genres or image from the discarded copy.
2. **Upsert into the CMS.** Each surviving gig is matched against existing gigs by
   normalized title on the same day. New gigs are created; existing automatic gigs are
   updated; hand-edited gigs are left untouched (see below).
3. **Debounced prune.** Future, automatically-created gigs that have not been seen by a
   crawl for several consecutive days are removed, so cancelled or de-listed events age
   out. This is skipped entirely if the run stored nothing, so a single failed scrape
   night can never empty the site.

The whole run is **non-destructive by default**: it never clears and rebuilds. A bad night
leaves the existing listing in place.

## Business rules and editorial policy

- **Curated discovery.** Only known-good sources are ever visited, so SEO spam and
  irrelevant aggregated events never enter the funnel.
- **The taste filter is the core product decision.** Aggregators carry everything, so the
  strict keep/reject genre policy - applied by the deterministic parsers where possible and
  by the language model everywhere else - is what makes the listing feel curated rather than
  a firehose.
- **Genres are required.** Every stored gig carries at least one genre; an act that fails
  the filter produces an empty genre list, which is the signal to drop it. Genres are
  stored today even though the site does not yet render them.
- **The manual contract.** The `manual` flag is a hand-editing lock. The crawler always
  writes automatic gigs as non-manual and never modifies, and never prunes, a gig marked
  manual. To add or correct a gig by hand and have the nightly run leave it alone, mark it
  manual in the CMS.
- **City scoping.** The whole crawler is city-agnostic except for one city configuration
  (name and local-language aliases, plus how to geo-filter the region-coarse aggregator and
  which nearby-but-out-of-city locales to exclude). Targeting a new city means adding a city
  config and its source registry, nothing more.
- **Trust the links we just scraped.** Event URLs are not pre-validated with extra network
  probes, because ticketing sites routinely reject those probes and would drop valid links.
  The occasional dead link is fixable in the CMS.

## Validation and data quality

Correctness is enforced at several layers, so a sloppy page or a hallucinated field cannot
reach the site:

| Rule | Where it applies |
|---|---|
| Structured, schema-checked shapes at every external boundary (env config, API responses, model output, page content) | Throughout the crawler; a bad shape fails fast |
| City-only: an event must explicitly be in the target city, or it is dropped | Both the deterministic parser and the LLM prompt |
| Date accuracy: a real day-and-month is required; a bare year or month, or a guessed/today date, is rejected | Extraction prompt and date parsing |
| Date window: only events inside the "today to N months ahead" window are kept, re-checked when cached results are replayed | Extraction and cache replay |
| Genre backstop: anything the model marks reject or leaves ungenred is dropped in code | After extraction |
| Price normalization: a single starting price, or "Free"/"N/A", never a list | After extraction |
| URL normalization: bare domains and category links are rejected; a listing link is upgraded to a specific event link or dropped | After extraction |
| Title cleaning: venue suffixes and stray punctuation stripped; titles kept to the artist/event name | After extraction and in the parsers |
| Venue canonicalization: alias map plus dash/accent/year normalization collapses name variants | Before storage |
| Manual protection: hand-edited gigs are never updated or pruned | At upsert and prune |
| Legacy normalization: older records with an unset manual flag are treated as non-manual and backfilled | On CMS startup and in filters |

## Cost control

The dominant cost is language-model tokens, and extraction is the vast majority of it. It
is bounded by:

- **A cheap model tier by default**, with a documented upgrade path if extraction or taste
  quality regresses.
- **An extraction cache.** Each scraped page's exact model-input content is hashed; if an
  unchanged page was seen in a recent run, its previously extracted gigs are replayed
  instead of calling the model again. Since event pages rarely change, most nights re-pay
  for almost nothing. Cached results are stored as one JSON blob in the CMS (so there are
  no files or volumes), loaded once at the start of a run and saved once at the end, and
  expire after a few days so far-future events entering the window and any missed edits
  self-heal. The cache is fail-safe: if it is unreachable or disabled, every lookup simply
  misses and the run makes more model calls rather than breaking.
- **Deterministic parsing where possible.** Structured-listing sources and price backfill
  spend no tokens at all.
- **Volume knobs**: how many sources run in parallel, how many detail pages per source, how
  many pages per model call, and how often the whole thing runs.

## Configuration

Everything operational is environment-driven and validated on startup. The important
knobs, grouped by purpose:

- **Connections and credentials** - CMS URL and API token, the model API key.
- **Schedule** - the cron expression and timezone for the nightly run.
- **Scope and cost** - how many months ahead to look, source and page-scraping concurrency,
  the per-source detail-page cap, and the model's per-call page batch size.
- **Behavior toggles** - the extraction cache and its expiry, price backfill, escalation of
  coarsely-tagged events, and the prune grace period.
- **Access** - an optional bearer token that protects the manual sync and delete endpoints.

## Infrastructure

**Development** uses Docker Compose to bring up the whole stack: PostgreSQL (with a
persistent volume and a health check), the CMS (source-mounted for live reload, waiting on
a healthy database), the crawler (on a browser-capable image, waiting on the CMS), and the
web app. Docker-topology settings (service hostnames, ports) live in the compose file;
secrets live in each app's own environment file.

**Production** runs on Railway, one service per app plus a managed PostgreSQL, each app
deployed from its own container. The crawler exposes a health endpoint for the platform's
checks, and the web app reaches the CMS over private networking.

## Design principles

- **Ports and adapters (hexagonal).** The sync logic depends only on abstract capabilities
  (scrape, extract, store); the concrete browser, model and CMS implementations are chosen
  at startup. Swapping a vendor, or mocking one for a test, touches nothing in the core.
- **A single command.** The whole sync is one operation with one clear result summary,
  making it easy to trigger, schedule, or run once by hand.
- **Schema-first.** Every external boundary is described by an explicit, validated schema
  with types derived from it, so the shape of data is checked rather than assumed.
- **City-agnostic core.** All the city-specific knowledge is isolated in one configuration
  point, so the same machinery can serve a different city.
- **Fail toward the existing listing.** Non-destructive writes, debounced pruning, retries
  with backoff, a fail-safe cache, and independent read/write paths all bias the system
  toward keeping the last good data visible when something goes wrong.

## Extending the system

- **Add a venue or aggregator** - add an entry to the source registry with its listing
  URL(s) and, for a venue, its canonical name and neighborhood. Confirm the listing page
  actually loads and shows upcoming events before enabling it.
- **Handle a source with structured markup** - give it a deterministic listing parser so it
  bypasses the language model entirely.
- **Correct or add a gig by hand** - edit it in the CMS and mark it manual so the nightly
  run leaves it alone.
- **Target a new city** - add a city configuration and a source registry for it, and point
  the active-city setting at it.
