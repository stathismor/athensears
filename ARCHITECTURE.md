# Architecture

## What Athens Ears is

Athens Ears is a curated listing of upcoming live music in Athens, Greece. It has a
deliberate editorial taste: it keeps rock, indie, alternative, post-punk, punk, metal,
post-rock, shoegaze, dark/goth, experimental/electronic, contemporary classical, jazz,
folk and adjacent genres, and it strictly excludes mainstream pop, commercial EDM and
club DJ nights, hip-hop, Greek popular music, tribute/cover acts, and comedy/theatre.

On a regular cadence (about once a night, driven by an external scheduler - the service has
no built-in cron) an automated crawler visits a hand-picked set of Athens venues and
ticketing pages, extracts the gigs that fit the taste, and publishes them to a public
website. The listing maintains itself, but a human can override, protect, or remove any
individual entry, and those manual decisions survive every future run.

## What the system is built to do

These are the goals the design serves. The rest of the document explains how each is met.

- **Self-maintaining.** A run discovers, filters and stores gigs with no human in the loop,
  and is meant to run on a regular schedule (about once a night, via an external scheduler
  pointed at the sync endpoint). A person only steps in to correct things.
- **Curated, not a firehose.** A strict keep/reject taste filter is the core product
  decision. Only known-good sources are ever visited.
- **Human overrides survive re-syncs.** Anything a human edits, adds, or removes in the
  CMS is protected: the next run will not overwrite it, will not duplicate it, and will not
  bring back something a human deleted.
- **No duplicates.** The same real-world event is stored once, whether it is surfaced by
  several sources on one night or seen again on later nights, and even after its title is
  edited by hand.
- **Deletions are durable and visible.** Removing a gig is a soft delete: the row is kept
  as a record of what was removed and why, and a removed gig is not resurrected.
- **Observable.** From the CMS alone you can tell what is stored, where it came from, when
  it was first added, when its content last changed, when it was last seen by a crawl, and
  what each run did.
- **Fails toward the last good data.** A failed run leaves the existing listing in place
  rather than emptying it.

## System at a glance

Three applications plus a database, kept in one pnpm workspace monorepo.

```
    curated sources                                   public visitor
          |                                                  ^
          | scrapes                                          | serves pages
          v                                                  |
    +---------+     writes      +---------+     reads      +-------+
    | Crawler | --------------> |   CMS   | <------------- |  Web  |
    +---------+    (REST)       +---------+    (REST)      +-------+
          |                          |
          | browser + LLM            | single system of record
          v                          v
    source registry            +------------+
                               | PostgreSQL |
                               +------------+
```

The crawler only writes. The web app only reads. The CMS is the boundary between them and
the single source of truth. The two never talk to each other directly, so the site keeps
serving the last good data even while a crawl is running or failing.

## Components

- **Gig Crawler** - discovers, extracts, filters, deduplicates and stores gigs.
- **CMS** - a headless content system that holds venues, gigs and run history, and serves
  them over a REST API.
- **Web** - a server-rendered site that reads from the CMS and shows upcoming gigs.
- **PostgreSQL** - the persistent store behind the CMS.

---

## Gig Crawler

A long-running Node service that exposes a small HTTP surface for operating it: a health
check, a sync trigger, a sync-status probe, an in-place repair of stored gigs, and a safe
bulk-delete endpoint. The state-changing endpoints can be protected by a shared bearer
token when one is configured.

A sync is a single operation that performs the full discover-extract-filter-store pipeline
described below. It is triggered on demand through the API; the service has no built-in
scheduler. The intended cadence is about once a night, achieved by pointing an external
scheduler at the sync endpoint. Only one sync (or repair) runs at a time.

Discovery is driven by a **curated source registry**, not open-web search. Each source is a
known Athens venue or a ticketing aggregator, described by one or more listing-page URLs
plus metadata (type, canonical venue name, neighborhood, website, and a few behavior
flags). Walking a hand-maintained list rather than searching the web is what keeps every
run deterministic, cheap and high-signal: noise never enters in the first place. Adding a
venue is a one-line registry entry; a source can be disabled without deleting it.

One hard rule for venue sources: the listing URL must be a genuine venue calendar. A
keyword-search page on an aggregator looks similar but also surfaces *other* venues'
events, and because a venue source stamps its venue name onto everything it yields, such a
page mislabels foreign events wholesale (this happened with allevents.in "venue" pages,
now disabled in the registry).

The crawler leans on three external capabilities, each hidden behind an internal port so
the core logic never depends on a concrete vendor.

| Capability | Provided by | Purpose |
|---|---|---|
| Page scraping | A headless browser, with a plain-HTTP fallback | Fetch listing and event pages, extract links, text and structured metadata |
| Language model | Google Gemini (a cheap "flash-lite" tier by default) | Pick event-detail links out of a page, and extract, taste-filter and genre-label structured gigs |
| Storage | The CMS REST API | Read and write venues, gigs, run history and the crawler's own cache |

### The sync process

A run is a single operation with one clear result summary. It proceeds in these steps.

1. **Set the date window.** The run computes a window from today to N months ahead. Only
   events inside this window are ever kept, and the window is re-checked whenever a cached
   result is replayed, so events that have aged out are dropped.

2. **Load the extraction cache.** The crawler loads its cache once at the start of the run.
   The cache lets an unchanged page skip the expensive language-model call, and it is the
   dominant cost saver: since event pages rarely change, most runs re-pay for almost
   nothing. Entries expire after a few days, so far-future events entering the window and any
   missed edits self-heal. It is fail-safe: if it is unreachable or disabled, every lookup
   simply misses and the run makes more model calls rather than breaking.

3. **Seed venue metadata.** For each venue source, the registry's known website and
   neighborhood are written to the matching venue, so the site can link venues.

4. **Walk the source registry.** Enabled sources are processed several at a time. Each
   source goes through discovery and extraction:

   - **Discovery.** The source's listing page(s) are scraped. Structured-listing sources
     embed machine-readable event data in their HTML and are parsed deterministically (no
     language model). Everything else discovers individual event-detail pages by asking the
     language model which of a listing page's links are real event pages, then scrapes
     those. The number of detail pages per source is capped to bound cost and time. Some
     sources are listing-only, so discovery is skipped and gigs come straight from the
     listing.
   - **Extraction and taste filtering.** The scraped pages are handed to the language model,
     which extracts structured gigs and applies the editorial taste filter in one step,
     labelling each kept act with up to three genres and rejecting anything out of taste.
     For venue sources, the registry's canonical venue name is stamped onto every gig,
     eliminating venue-name drift. For aggregator sources the venue is extracted per event
     and normalized against an alias map that ignores case, accents, punctuation and
     Greek/Latin look-alike letters, so spelling variants of the same venue collapse. Titles
     are reduced to the bare act name: the model is instructed to strip venue tags, dates,
     and subtitles, and a deterministic cleaner backstops it (tolerating single-letter typos
     in written-out dates). Each gig is also stamped with the id of the source that produced
     it and a stable per-event key (see Identity below).
   - **Cache use.** Before extracting a page, the crawler checks whether the same page
     content was seen recently; if so it replays the previously extracted gigs instead of
     calling the model. Replayed titles are re-run through the current cleaning rules, so a
     rule change takes effect everywhere without re-extraction (and a repair's fixes are
     never undone by a stale replay). New extractions are recorded to be flushed at the end
     of the run.

5. **Refine the extraction (optional passes).**

   - **Escalation of coarsely-tagged events.** A structured source with a coarse genre
     vocabulary can bury genuinely interesting acts under a generic "other" tag. Those
     specific events are escalated to the language model, which classifies them properly and
     drops the actual junk.
   - **Price backfill.** When extraction finds no price for a gig that has a specific event
     page, a deterministic extractor pulls the price from that page's structured data (no
     language model), reusing already-fetched HTML where possible.

6. **Deduplicate across sources.** Once every source has produced gigs, duplicates of the
   same event surfaced by multiple sources are collapsed (see Identity and deduplication).

7. **Upsert into the CMS.** Each surviving gig is matched against what is already stored.
   New gigs are created; existing automatic gigs are updated in place; gigs a human has
   protected or removed are left exactly as the human left them (see The manual contract and
   Soft deletion). Every gig the run saw has its "last seen" timestamp refreshed.

8. **Record the run.** The run writes a history entry summarizing what happened: its
   timing, how it was triggered, the counts below, and the gigs it created and updated.
   This is the audit trail for "what did a given run do".

The whole run is **non-destructive**: it never clears and rebuilds, and it never deletes
gigs on its own. A gig only leaves the site when a human cancels or hides it, or via the
explicit delete endpoint (see The manual contract and Soft deletion).

### Identity and deduplication

Two different matching problems are solved with two different keys. Getting this right is
what prevents duplicates and lets human edits survive.

**Deduplication within a single run.** The same show can appear on a venue's own page and
on an aggregator. These carry different links and share no id, so they are collapsed by
comparing content: normalized title, calendar day, and canonical venue, in a few passes.
An exact match is collapsed first; then titles that name the same event on the same night
at the same venue are folded together - a shorter billing into a fuller one (so "Megadeth"
folds into "Megadeth / Sepultura") and small-typo variants into each other (digits must
match exactly and short titles get no tolerance, so numbered shows never merge); then a
recurring series listed once per date under a single shared event page is folded into one
upcoming entry. The surviving record keeps the most specific link, backfills any missing
price, description, genres or image from the copies it absorbs, and carries the source and
per-event key of the copy it kept.

**Identity across runs.** To decide whether a gig already exists in the CMS from a previous
night, the crawler matches in two tiers. First it looks for a stored gig with the same
source and per-event key. This key is a stable anchor: it is set once and never rewritten,
so it survives an edited title and small wording drift from the source. If there is no such
gig, it falls back to matching within the same day and venue: an exact normalized title
first, then the same same-event matcher the in-run dedup uses (subset billings, small
typos), so a title that drifted between runs updates its row instead of creating a
duplicate. On such a drifted match the stored display title is kept unless the new one is
strictly fuller - otherwise sources rewording a billing would flip-flop the title night
after night. A match that a human has protected or removed is left untouched; an ordinary
automatic match is updated in place; no match at all creates a new gig.

The stable per-event key is the single most important guard against duplicates. Without it,
renaming a gig by hand would make the crawler fail to recognize it and re-create the
original on every run.

### The manual contract

Anything a human touches in the CMS becomes protected automatically. When a person edits or
creates a gig in the admin, the CMS marks it as manual. The crawler never modifies a manual
gig. To correct or add a gig by hand and have every future run leave it alone, a human just
edits it - there is no flag to remember.

The crawler always writes automatic gigs as non-manual, and it distinguishes its own writes
from a human's by the credential it uses, so its own updates never trip the automatic
protection.

### Soft deletion and tombstones

Removal is never a silent hard delete. Every gig carries a status.

| Status | Meaning | Set by |
|---|---|---|
| active | Shown on the site | Default for new and current gigs |
| cancelled | The event was called off | A human |
| hidden | Deliberately removed from the site | A human |

The web app shows only active, future gigs. When a human sets a gig to hidden or cancelled,
the crawler treats that as a
tombstone: even while the source keeps listing the event, the crawler recognizes the gig by
its stable key and will not bring it back. This is what makes "I removed it and it stayed
removed" true.

A true, permanent purge is still available as an explicit destructive maintenance action
(see the delete endpoint), but the normal way to take a gig off the site is to hide or
cancel it.

### Configuration flags

Everything operational is environment-driven and validated on startup.

Connections and credentials:

| Variable | Purpose |
|---|---|
| STRAPI_API_URL | Base URL of the CMS |
| STRAPI_API_TOKEN | The crawler's write token for the CMS |
| GEMINI_API_KEY | Language-model API key |
| GEMINI_MODEL | Model tier (defaults to a cheap flash-lite tier) |
| SYNC_API_KEY | Optional bearer token that protects the crawler's write endpoints |

Scope and cost:

| Variable | Purpose |
|---|---|
| SYNC_MONTHS_AHEAD | How far ahead to crawl, in months (default 3) |
| SYNC_SOURCE_CONCURRENCY | How many sources are crawled in parallel (default 4) |
| SYNC_MAX_DETAIL_PER_SOURCE | Cap on detail pages scraped per source per run (default 30) |
| SCRAPER_CONCURRENCY | How many pages are scraped in parallel (default 5) |
| GEMINI_CHUNK_SIZE | Pages sent per model call (default 10) |
| GEMINI_RATE_LIMIT_RPM | Model-request pacing, requests per minute (default 120) |

Behavior toggles:

| Variable | Purpose |
|---|---|
| SYNC_ENRICH_PRICES | Deterministic price backfill from detail pages (default on) |
| SYNC_ESCALATE_OTHER | Send coarsely-tagged events to the model for reclassification (default on) |
| CRAWLER_CACHE_ENABLED | The extraction cache (default on) |
| CRAWLER_CACHE_TTL_DAYS | How long a cache entry is trusted before re-extraction (default 7) |
| LOG_LEVEL | Logging verbosity (default info) |

### Operating it by hand

The sync is triggered through a small HTTP surface. When SYNC_API_KEY is set, the state-changing
endpoints require a matching bearer token.

| Endpoint | Method | Purpose |
|---|---|---|
| /health | GET | Liveness probe |
| / | GET | Service info and endpoint list |
| /api/sync | POST | Trigger a sync, or an in-place repair of stored gigs. Runs in the background and returns immediately |
| /api/sync/status | GET | Reports running or idle |
| /api/gigs/delete | POST | Bulk-delete non-manual gigs. Preview by default |

Only one sync or repair runs at a time; a second request while one is in flight is
rejected. Options are passed in the JSON body and are all optional.

The three write modes do very different things. `force` and `clear` both re-fetch from
sources (differing only in whether existing gigs are wiped first); `repair` never touches
the network or the model - it only re-processes rows already stored. So: a normal run to
fetch what's new, `force` to re-extract past a stale cache, `clear` to rebuild from scratch,
and `repair` to bring stored titles/venues in line and collapse stored duplicates after
the cleaning or matching rules change.

Sync (scrape) options:

| Option | Effect |
|---|---|
| clear | Destructive: purge non-manual gigs first, then rebuild from the scrape. Rarely needed |
| force | Bypass the extraction cache for a full re-extraction |
| monthsAhead | Override the date window for this run |
| maxSources | Crawl at most this many sources (a test knob) |
| sources | Restrict the run to specific source ids, e.g. more-com (a test knob) |

Repair options:

| Option | Effect |
|---|---|
| repair | Re-apply the current title/venue cleaning rules to gigs already stored, in place (no scrape, no model calls), and merge rows that now resolve to the same event (same day and venue, equal/subset/near-identical titles), keeping the better-linked row and deleting the duplicate. Run it after the cleaning rules change. Idempotent, and it leaves manual gigs untouched |

Delete options:

| Option | Effect |
|---|---|
| dryRun | When true (the default), report what would be deleted without deleting. Set false to actually delete. Manual gigs are always protected |

Common operations (add `-H "Authorization: Bearer $SYNC_API_KEY"` when a token is set):

```bash
# Trigger a full sync (crawl every source and upsert)
curl -XPOST https://<crawler-url>/api/sync

# Test one source cheaply (a deterministic source spends nothing on the model)
curl -XPOST https://<crawler-url>/api/sync \
  -H 'Content-Type: application/json' -d '{"sources": ["more-com"]}'

# Preview which non-manual gigs a bulk delete would remove (safe; deletes nothing)
curl -XPOST https://<crawler-url>/api/gigs/delete

# Repair stored titles/venues in place after changing the cleaning rules
curl -XPOST https://<crawler-url>/api/sync \
  -H 'Content-Type: application/json' -d '{"repair": true}'
```

---

## CMS

A headless content system backed by PostgreSQL. It is the single source of truth and the
only component that talks to the database. On startup it grants public read access to gigs
and venues (so the website can read them without a token), normalizes any legacy records
that predate the current schema, and can optionally seed demo data into an empty database
(off by default, so a fresh production deploy stays empty until the first crawl). Writes
require the crawler's API token.

### Content types

**Gig** - a single live music event.

| Field | Meaning |
|---|---|
| title | The artist or event name, cleaned of venue suffixes and stray punctuation |
| date | Event date and time |
| time_display | Optional human-friendly start time |
| price | A single starting price, or "Free"/"N/A" |
| description | Optional blurb |
| url | The most specific event link found |
| genres | One to three genres; always present (an act with none failed the filter and is not stored) |
| venue | Relation to a Venue |
| source | Which registry source surfaced this gig (empty for a gig created by hand) |
| sourceKey | Stable per-event identity within that source; the anchor for run-to-run matching. Set once, never rewritten |
| manual | The human-ownership lock; set automatically when a person edits or creates the gig |
| status | active, cancelled, or hidden |
| lastSeenAt | The last crawl run that saw this gig |
| deletedAt | When the gig was soft-deleted, if it has been |

The platform also records two timestamps automatically: a created timestamp (when the gig
was first added) and an updated timestamp (when its content last actually changed). Because
"last seen by a crawl" is tracked separately in lastSeenAt, the updated timestamp is a
truthful record of real content changes rather than being bumped on every run.

**Venue** - name, address, website, and Athens neighborhood.

**Sync Run** - one record per run, the audit trail of the automation.

| Field | Meaning |
|---|---|
| startedAt / finishedAt | Run timing |
| trigger | How the run was started (a manual API request, or an external scheduler) |
| counts | Sources crawled, gigs created, updated, skipped as manual, served from cache, sent to the model, and errors |
| affected | The gigs created and updated by this run |

**Crawl Cache** - a single internal record holding the crawler's extraction cache as one
JSON blob. Written by the crawler and not meant to be edited by hand.

### The manual lock

The CMS is where human ownership is enforced. When a gig is created or edited through the
admin, the CMS automatically marks it as manual, distinguishing a human's action from the
crawler's writes by the credential used. This is why a person never has to remember a flag:
editing a gig is enough to protect it from every future run.

### Observability

Everything needed to answer "what is here, where did it come from, and what happened to it"
lives in the data itself.

| Question | Where the answer is |
|---|---|
| What is stored and where did it come from | source and venue on each gig |
| Was it added by a human or the crawler | manual (human-owned) and source (empty means hand-created) |
| When was it first added | The created timestamp |
| When did its content last change | The updated timestamp |
| When was it last confirmed by a crawl | lastSeenAt |
| Was it removed, and how | status (cancelled, hidden) and deletedAt |
| What did a given run do | The Sync Run record for that run |

---

## Web

A server-rendered site. On every request it fetches the upcoming, active gigs from the CMS
(future dates only, sorted by date), groups them by month, and renders a responsive
listing. Because it renders live rather than at build time, new gigs and manual edits
appear immediately with no rebuild. A short cache header keeps the CMS from being hit
on every single request while still staying fresh. For its server-side fetch it prefers a
private-network internal URL and falls back to the public URL.

---

## PostgreSQL

The persistent store behind the CMS. It holds everything: venues, gigs, run history, and
the crawler's extraction cache. There are no separate files, volumes, or caches to manage.

---

## Business rules and editorial policy

- **Curated discovery.** Only known-good sources are ever visited, so SEO spam and
  irrelevant aggregated events never enter the funnel.
- **The taste filter is the core product decision.** Aggregators carry everything, so the
  strict keep/reject genre policy - applied by the deterministic parsers where possible and
  by the language model everywhere else - is what makes the listing feel curated.
- **Genres are required.** Every stored gig carries at least one genre; an act that fails
  the filter produces no genres, which is the signal to drop it.
- **Human decisions are final.** Edits, additions and removals made by a person are
  protected automatically and are never undone by the automation.
- **City scoping.** The crawler is city-agnostic except for one city configuration (name
  and local-language aliases, how to geo-filter the region-coarse aggregator, and which
  nearby-but-out-of-city locales to exclude). Targeting a new city means adding a city
  config and a source registry, nothing more.
- **Trust the links we just scraped.** Event URLs are not pre-validated with extra network
  probes, because ticketing sites routinely reject those probes and would drop valid links.
  The occasional dead link is fixable in the CMS.

## Validation and data quality

Correctness is enforced at several layers, so a sloppy page or a hallucinated field cannot
reach the site.

| Rule | Where it applies |
|---|---|
| Structured, schema-checked shapes at every external boundary (config, API responses, model output, page content) | Throughout the crawler; a bad shape fails fast |
| City-only: an event must explicitly be in the target city, or it is dropped | The parser and the model prompt |
| Date accuracy: a real day and month is required; a bare year or month, or a guessed date, is rejected | Extraction and date parsing |
| Date window: only events inside the "today to N months ahead" window are kept, re-checked on cache replay | Extraction and cache replay |
| Genre backstop: anything the model marks reject or leaves ungenred is dropped | After extraction |
| Price normalization: a single starting price, or "Free"/"N/A", never a list | After extraction |
| URL normalization: bare domains and category links are rejected; a listing link is upgraded to a specific event link or dropped | After extraction |
| Title cleaning: venue suffixes and stray punctuation stripped | After extraction and in the parsers |
| Venue canonicalization: alias map plus dash/accent/year normalization collapses name variants | Before storage |
| Manual and tombstone protection: human-owned or human-removed gigs are never updated or resurrected | At upsert |
