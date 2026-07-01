import type { ScraperPort } from "../ports/ScraperPort.js";
import type { LLMPort } from "../ports/LLMPort.js";
import type { GigsPort } from "../ports/GigsPort.js";
import type { Gig } from "../models/gig.js";
import { activeSources, type GigSource } from "../models/sources.js";
import { normalizeVenueName } from "../models/venueAliases.js";
import { normalizeTitle } from "../utils/normalize.js";
import { logger } from "../utils/logger.js";
import { env } from "../models/env.js";
import { parseMoreComListing } from "../parsers/moreComListing.js";

/**
 * Source-specific deterministic listing parsers. When a listing-only source embeds
 * structured event data (schema.org microdata) in its HTML, parse it directly instead
 * of running Readability + the LLM — faster, cheaper and far more reliable.
 */
const LISTING_PARSERS: Record<
  string,
  (html: string, baseUrl: string, dateRange: { startDate: string; endDate: string }) => Gig[]
> = {
  "more-com": parseMoreComListing,
};

export interface SyncStats {
  sources: number;
  listingPagesScraped: number;
  detailUrlsFound: number;
  detailPagesScraped: number;
  gigsExtracted: number;
  gigsCreated: number;
  gigsUpdated: number;
  gigsSkippedManual: number;
  gigsPruned: number;
  errors: number;
}

/** Generic tokens that shouldn't drive event-URL matching. */
const TITLE_STOPWORDS = new Set([
  "live",
  "tour",
  "athens",
  "athina",
  "fest",
  "festival",
  "show",
  "concert",
  "band",
  "with",
  "feat",
  "night",
  "stage",
  "music",
  "greece",
  "plus",
  "special",
  "guest",
  "guests",
  "presents",
]);

/**
 * Pick the candidate URL whose slug shares the most significant title tokens — used to
 * upgrade a listing-page gig to its specific event link. Returns undefined if no
 * confident match (so we drop a useless generic link rather than guess).
 */
function matchEventUrl(title: string, urls: string[]): string | undefined {
  const tokens = (title.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 4 && !TITLE_STOPWORDS.has(t) && !/^\d{4}$/.test(t) // drop years
  );
  if (tokens.length === 0) {
    return undefined;
  }
  let best: string | undefined;
  let bestScore = 0;
  for (const url of urls) {
    const slug = url.toLowerCase();
    const score = tokens.filter((t) => slug.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return bestScore >= 1 ? best : undefined;
}

/** Significant tokens of a title (normalized words). */
function titleTokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(Boolean));
}

/** True if `a` is a strict subset of `b` (every token of a is in b, and a is smaller). */
function isStrictSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size >= b.size) {
    return false;
  }
  for (const t of a) {
    if (!b.has(t)) {
      return false;
    }
  }
  return true;
}

/**
 * Walks the curated source registry every run:
 *   Pass A — scrape each source's listing page(s) and discover event-detail URLs.
 *   Pass B — scrape those detail pages and extract structured, taste-filtered gigs.
 * Then upserts into the CMS (create new, update existing auto gigs, never touch
 * hand-edited `manual` gigs). The run is non-destructive: a bad scrape night leaves
 * existing gigs in place rather than clearing the site.
 */
export class SyncGigsCommand {
  constructor(
    private readonly scraper: ScraperPort,
    private readonly llm: LLMPort,
    private readonly gigs: GigsPort
  ) {}

  async execute(
    options: { clearExisting?: boolean; monthsAhead?: number } = {}
  ): Promise<SyncStats> {
    const monthsAhead = options.monthsAhead ?? env.SYNC_MONTHS_AHEAD;
    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const endDateObj = new Date(now);
    endDateObj.setMonth(endDateObj.getMonth() + monthsAhead);
    const endDate = endDateObj.toISOString().slice(0, 10);
    const dateRange = { startDate, endDate };

    const stats: SyncStats = {
      sources: 0,
      listingPagesScraped: 0,
      detailUrlsFound: 0,
      detailPagesScraped: 0,
      gigsExtracted: 0,
      gigsCreated: 0,
      gigsUpdated: 0,
      gigsSkippedManual: 0,
      gigsPruned: 0,
      errors: 0,
    };

    const sources = activeSources();
    stats.sources = sources.length;

    logger.info(
      { monthsAhead, startDate, endDate, sources: sources.map((s) => s.id) },
      "Starting gig sync (curated source registry)"
    );

    try {
      // Opt-in destructive clear (never the default — a failed run must not empty the site)
      if (options.clearExisting) {
        logger.info("=== CLEARING EXISTING GIGS (explicit) ===");
        const deletedCount = await this.gigs.deleteAllGigs();
        logger.info({ deletedCount }, "Cleared existing gigs");
      }

      if (sources.length === 0) {
        logger.warn("No enabled sources in registry, aborting sync");
        return stats;
      }

      // Seed/refresh curated venue metadata (website, neighborhood) from the registry
      // so the site can link venues. (Aggregator-only venues are created name-only later.)
      for (const s of sources) {
        if (s.type === "venue" && s.venueName) {
          try {
            await this.gigs.upsertVenue({
              name: s.venueName,
              website: s.website,
              neighborhood: s.neighborhood,
            });
          } catch (error) {
            logger.warn({ source: s.id, error }, "Failed to seed venue metadata");
          }
        }
      }

      // Collect gigs from sources in parallel (each stamps its own venue). A worker
      // pool bounds how many sources scrape/extract at once.
      const allGigs: Gig[] = [];
      let nextSource = 0;
      const collectWorker = async () => {
        while (nextSource < sources.length) {
          const source = sources[nextSource++];
          try {
            const sourceGigs = await this.collectFromSource(source, dateRange, stats);
            logger.info(
              { source: source.id, gigs: sourceGigs.length },
              "Collected gigs from source"
            );
            allGigs.push(...sourceGigs);
          } catch (error) {
            logger.error({ source: source.id, error }, "Failed to collect from source");
            stats.errors++;
          }
        }
      };
      const sourceConcurrency = Math.max(1, env.SYNC_SOURCE_CONCURRENCY);
      await Promise.all(
        Array.from({ length: Math.min(sourceConcurrency, sources.length) }, () => collectWorker())
      );

      // Collapse cross-source duplicates (same event listed by venue + aggregators)
      const dedupedGigs = this.dedupeGigs(allGigs, sources);
      stats.gigsExtracted = dedupedGigs.length;
      logger.info(
        { raw: allGigs.length, deduped: dedupedGigs.length },
        "Extracted gigs across all sources (deduped)"
      );

      if (dedupedGigs.length === 0) {
        logger.warn("No gigs extracted, sync complete (existing gigs left untouched)");
        return stats;
      }

      // Note: we deliberately do NOT pre-validate event URLs with HEAD requests.
      // Ticketing/aggregator sites reject or stall HEAD (timeouts), which silently
      // dropped most valid event links. The URLs come from pages we just scraped, so
      // we trust them; the occasional dead link is fixable in the CMS.

      // Upsert into the CMS
      for (const gig of dedupedGigs) {
        try {
          const existing = await this.gigs.findGig(gig.title, gig.date);

          if (existing?.manual) {
            logger.info(
              { title: gig.title, date: gig.date },
              "Leaving hand-edited (manual) gig untouched"
            );
            stats.gigsSkippedManual++;
            continue;
          }

          const venueId = await this.gigs.getOrCreateVenue(gig.venueName);

          if (existing) {
            await this.gigs.updateGig(existing.documentId, gig, venueId);
            stats.gigsUpdated++;
          } else {
            await this.gigs.createGig(gig, venueId);
            stats.gigsCreated++;
          }
        } catch (error) {
          logger.error({ gig: gig.title, error }, "Failed to store gig");
          stats.errors++;
        }
      }

      // Debounced prune: drop future, non-manual gigs not seen (updated) in the last
      // SYNC_PRUNE_GRACE_DAYS, so cancelled/removed gigs age out. Skipped entirely when
      // this run stored nothing — a failed scrape must never wipe the site.
      if (env.SYNC_PRUNE_GRACE_DAYS > 0 && stats.gigsCreated + stats.gigsUpdated > 0) {
        const cutoff = new Date(now.getTime() - env.SYNC_PRUNE_GRACE_DAYS * 86_400_000);
        try {
          stats.gigsPruned = await this.gigs.pruneStaleGigs(cutoff);
        } catch (error) {
          logger.error({ error }, "Prune step failed (non-fatal)");
        }
      }

      logger.info({ stats }, "=== Sync Complete ===");
      return stats;
    } catch (error) {
      logger.error({ error }, "Fatal error during sync");
      stats.errors++;
      throw error;
    }
  }

  /**
   * Collapse duplicates of the same event surfaced by multiple sources (e.g. a venue
   * site + an aggregator) using a punctuation-normalized title + day + venue key.
   * Keeps the record with the best link (specific event page > generic listing > none)
   * and backfills missing price/description/genre/image from the discarded copy.
   */
  private dedupeGigs(gigs: Gig[], sources: GigSource[]): Gig[] {
    const listingUrls = new Set(sources.flatMap((s) => s.listingUrls));
    const urlScore = (url?: string): number => {
      if (!url) {
        return 0;
      }
      return listingUrls.has(url) ? 1 : 2; // generic listing vs specific event page
    };
    // Merge `b` into `a`, keeping `keepTitle ? a's : the better-linked` title, adopting the
    // better link and backfilling any field the kept record is missing.
    const merge = (a: Gig, b: Gig, keepTitle: boolean): Gig => {
      const base = keepTitle || urlScore(a.url) >= urlScore(b.url) ? a : b;
      const other = base === a ? b : a;
      const better = urlScore(a.url) >= urlScore(b.url) ? a : b;
      return {
        ...base,
        url: better.url || base.url || other.url,
        price: base.price ?? other.price,
        description: base.description ?? other.description,
        genre: base.genre ?? other.genre,
        imageUrl: base.imageUrl ?? other.imageUrl,
      };
    };
    const dayVenueKey = (g: Gig): string =>
      `${g.date.toISOString().slice(0, 10)}|${normalizeVenueName(g.venueName).toLowerCase()}`;

    // Pass 1: exact match on normalized title + day + canonical venue (punctuation variants).
    const byKey = new Map<string, Gig>();
    for (const gig of gigs) {
      const key = `${normalizeTitle(gig.title)}|${dayVenueKey(gig)}`;
      const existing = byKey.get(key);
      byKey.set(key, existing ? merge(existing, gig, false) : gig);
    }

    // Pass 2: within the same day+venue, collapse a billing that is a token-subset of a
    // fuller one (e.g. "Megadeth" into "Megadeth / Sepultura") — keep the fuller title.
    const groups = new Map<string, Gig[]>();
    for (const gig of byKey.values()) {
      const k = dayVenueKey(gig);
      const arr = groups.get(k);
      if (arr) {
        arr.push(gig);
      } else {
        groups.set(k, [gig]);
      }
    }
    const result: Gig[] = [];
    for (const group of groups.values()) {
      group.sort((a, b) => titleTokens(b.title).size - titleTokens(a.title).size); // fuller first
      const kept: Gig[] = [];
      for (const gig of group) {
        const tokens = titleTokens(gig.title);
        const hostIdx = kept.findIndex((k) => isStrictSubset(tokens, titleTokens(k.title)));
        if (hostIdx >= 0) {
          kept[hostIdx] = merge(kept[hostIdx], gig, true); // keep fuller (host) title
        } else {
          kept.push(gig);
        }
      }
      result.push(...kept);
    }
    return result;
  }

  /**
   * Scrape one source's listing page(s), discover event-detail URLs, scrape those,
   * and extract gigs. For venue sources, stamp the known canonical venue name.
   */
  private async collectFromSource(
    source: GigSource,
    dateRange: { startDate: string; endDate: string },
    stats: SyncStats
  ): Promise<Gig[]> {
    logger.info({ source: source.id, listingUrls: source.listingUrls }, "=== Source ===");

    // Pass A: scrape listing page(s)
    const listingScrapes = await this.scraper.scrapeMany(source.listingUrls);
    const okListings = listingScrapes.filter((s) => s.success);
    stats.listingPagesScraped += okListings.length;

    // listingOnly sources (e.g. more.com, whose detail pages are gated) are
    // extracted straight from the listing — no detail-page discovery/scraping.
    if (source.listingOnly) {
      if (okListings.length === 0) {
        logger.warn({ source: source.id }, "No listing pages scraped for listing-only source");
        return [];
      }

      // Structured-listing sources (e.g. more.com) embed schema.org Event microdata in
      // the listing HTML — parse it deterministically instead of Readability + LLM.
      const parser = LISTING_PARSERS[source.id];
      if (parser) {
        const parsed = okListings.flatMap((p) =>
          p.rawHtml ? parser(p.rawHtml, p.url, dateRange) : []
        );
        logger.info(
          { source: source.id, gigs: parsed.length },
          "Extracted gigs from structured listing"
        );
        return parsed;
      }

      let gigs = await this.llm.extractGigsFromMultiplePages(okListings, dateRange);

      // The gig "url" from a listing is the generic listing page. Upgrade it to a
      // per-event link found among the listing's hrefs (matched by title), or drop it —
      // a useless category link is worse than none.
      const candidateLinks = okListings.flatMap((p) => p.links ?? []);
      const listingUrlSet = new Set(source.listingUrls);
      gigs = gigs.map((g) => {
        const isGeneric = !g.url || listingUrlSet.has(g.url);
        if (!isGeneric) {
          return g;
        }
        return { ...g, url: matchEventUrl(g.title, candidateLinks) };
      });

      if (source.type === "venue" && source.venueName) {
        const venueName = source.venueName;
        gigs = gigs.map((g) => ({ ...g, venueName }));
      }
      return gigs;
    }

    // Discover event-detail URLs from the links on each listing page
    const detailUrls = new Set<string>();
    const geminiDelayMs =
      env.GEMINI_RATE_LIMIT_RPM > 0 ? Math.ceil(60000 / env.GEMINI_RATE_LIMIT_RPM) : 0;

    for (let i = 0; i < okListings.length; i++) {
      const page = okListings[i];
      if (page.links && page.links.length > 0) {
        const eventUrls = await this.llm.filterEventDetailUrls(page.links, { url: page.url });
        eventUrls.forEach((u) => detailUrls.add(u));
        if (geminiDelayMs > 0 && i < okListings.length - 1) {
          await new Promise((r) => setTimeout(r, geminiDelayMs));
        }
      }
    }

    // Don't re-scrape the listing pages themselves; cap per source
    for (const u of source.listingUrls) {
      detailUrls.delete(u);
    }
    const detailList = [...detailUrls].slice(0, env.SYNC_MAX_DETAIL_PER_SOURCE);
    stats.detailUrlsFound += detailList.length;

    // Pass B: scrape detail pages
    const detailScrapes = detailList.length > 0 ? await this.scraper.scrapeMany(detailList) : [];
    const okDetails = detailScrapes.filter((s) => s.success);
    stats.detailPagesScraped += okDetails.length;

    // Choose pages to extract from:
    // - venues: listing page (often an inline schedule) + detail pages
    // - aggregators: detail pages only (listing is a pure index); fall back to the
    //   listing page if no detail pages were discovered
    const pagesToExtract =
      source.type === "venue"
        ? [...okListings, ...okDetails]
        : okDetails.length > 0
          ? okDetails
          : okListings;

    if (pagesToExtract.length === 0) {
      logger.warn({ source: source.id }, "No pages to extract from for source");
      return [];
    }

    let gigs = await this.llm.extractGigsFromMultiplePages(pagesToExtract, dateRange);

    // Stamp the known venue for venue sources (kills venue-name drift / duplicates)
    if (source.type === "venue" && source.venueName) {
      const venueName = source.venueName;
      gigs = gigs.map((g) => ({ ...g, venueName }));
    }

    return gigs;
  }
}
