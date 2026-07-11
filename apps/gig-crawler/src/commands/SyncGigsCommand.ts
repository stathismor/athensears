import type { ScraperPort } from "../ports/ScraperPort.js";
import type { LLMPort } from "../ports/LLMPort.js";
import type { GigsPort, StoredGig } from "../ports/GigsPort.js";
import type { Gig } from "../models/gig.js";
import type { ScrapedContent } from "../models/scrapedContent.js";
import { activeSources, type GigSource } from "../models/sources.js";
import { normalizeVenueName } from "../models/venueAliases.js";
import {
  normalizeTitle,
  titleTokens,
  isStrictSubset,
  titlesLikelySame,
} from "../utils/normalize.js";
import { logger } from "../utils/logger.js";
import { env } from "../models/env.js";
import { parseMoreComListing, extractMoreComOtherUrls } from "../parsers/moreComListing.js";
import { extractPriceFromHtml } from "../utils/extractPrice.js";

/**
 * Source-specific deterministic listing parsers. When a listing-only source embeds
 * structured event data (schema.org microdata) in its HTML, parse it directly instead
 * of running Readability + the LLM - faster, cheaper and far more reliable.
 */
const LISTING_PARSERS: Record<
  string,
  (html: string, baseUrl: string, dateRange: { startDate: string; endDate: string }) => Gig[]
> = {
  "more-com": parseMoreComListing,
};

/**
 * Per-source extractors of detail-page URLs for events the deterministic listing parser
 * skips on genre (source tags them "other"). When SYNC_ESCALATE_OTHER is on, these pages
 * are scraped and batch-extracted through the LLM, recovering acts the coarse source
 * tagging buries. Mirrors LISTING_PARSERS; only sources with an entry escalate.
 */
const LISTING_OTHER_URL_EXTRACTORS: Record<
  string,
  (html: string, baseUrl: string, dateRange: { startDate: string; endDate: string }) => string[]
> = {
  "more-com": extractMoreComOtherUrls,
};

export interface SyncOptions {
  /** Wipe non-manual gigs before syncing (rarely needed). */
  clearExisting?: boolean;
  /** Date-window size; defaults to SYNC_MONTHS_AHEAD. */
  monthsAhead?: number;
  /**
   * Use the extraction cache (default true). Set false to force a full re-extraction
   * that ignores AND does not write the cache - useful for testing or a forced refresh.
   */
  useCache?: boolean;
  /** Crawl at most this many sources (for small-scale/local test runs). */
  maxSources?: number;
  /**
   * Restrict the run to these source ids (e.g. ["more-com"]). Lets you test a single
   * source cheaply - pick a deterministic one like "more-com" to spend nothing on the
   * LLM. Unknown ids are ignored. Applied before maxSources.
   */
  sources?: string[];
  /** How the run was triggered, recorded in the run journal (default "manual"). */
  trigger?: string;
}

export interface SyncStats {
  sources: number;
  listingPagesScraped: number;
  detailUrlsFound: number;
  detailPagesScraped: number;
  /** Pages replayed from the extraction cache (Gemini call skipped). */
  pagesFromCache: number;
  /** Pages sent to Gemini for extraction (cache misses). */
  pagesToGemini: number;
  gigsExtracted: number;
  gigsCreated: number;
  gigsUpdated: number;
  gigsSkippedManual: number;
  /** Existing gigs a human had removed (hidden/cancelled); left untouched, not resurrected. */
  gigsSkippedTombstoned: number;
  /** Unchanged gigs whose lastSeenAt was refreshed via the heartbeat (no content write). */
  gigsSeen: number;
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
 * Pick the candidate URL whose slug shares the most significant title tokens - used to
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

/**
 * Walks the curated source registry every run:
 *   Pass A - scrape each source's listing page(s) and discover event-detail URLs.
 *   Pass B - scrape those detail pages and extract structured, taste-filtered gigs.
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

  async execute(options: SyncOptions = {}): Promise<SyncStats> {
    const startedIso = new Date().toISOString();
    const monthsAhead = options.monthsAhead ?? env.SYNC_MONTHS_AHEAD;
    const useCache = options.useCache ?? true;
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
      pagesFromCache: 0,
      pagesToGemini: 0,
      gigsExtracted: 0,
      gigsCreated: 0,
      gigsUpdated: 0,
      gigsSkippedManual: 0,
      gigsSkippedTombstoned: 0,
      gigsSeen: 0,
      errors: 0,
    };
    // Short labels of the gigs this run touched, for the run journal.
    const affected = { created: [] as string[], updated: [] as string[] };

    let sources = activeSources();
    if (options.sources && options.sources.length > 0) {
      const wanted = new Set(options.sources);
      sources = sources.filter((s) => wanted.has(s.id));
    }
    if (options.maxSources !== undefined && options.maxSources >= 0) {
      sources = sources.slice(0, options.maxSources);
    }
    stats.sources = sources.length;

    logger.info(
      {
        monthsAhead,
        startDate,
        endDate,
        useCache,
        maxSources: options.maxSources,
        sources: sources.map((s) => s.id),
      },
      "Starting gig sync (curated source registry)"
    );

    try {
      // Opt-in destructive clear (never the default - a failed run must not empty the site)
      if (options.clearExisting) {
        logger.info("=== CLEARING EXISTING GIGS (explicit) ===");
        const deletedCount = await this.gigs.deleteAllGigs();
        logger.info({ deletedCount }, "Cleared existing gigs");
      }

      if (sources.length === 0) {
        logger.warn("No enabled sources in registry, aborting sync");
      } else {
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

        // Load the extraction cache up front so unchanged pages skip the Gemini call.
        // Best-effort: a cache failure logs and proceeds without it (see PageExtractionCache).
        // When useCache is false the cache is explicitly bypassed (no reads, no writes).
        await this.llm.loadCache?.(useCache);

        // Collect gigs from sources in parallel (each stamps its own venue + provenance).
        // A worker pool bounds how many sources scrape/extract at once.
        const allGigs: Gig[] = [];
        let nextSource = 0;
        const collectWorker = async () => {
          while (nextSource < sources.length) {
            const source = sources[nextSource++];
            try {
              const sourceGigs = await this.collectFromSource(source, dateRange, stats);
              const stamped = sourceGigs.map((g) => this.stampProvenance(source, g));
              logger.info(
                { source: source.id, gigs: stamped.length },
                "Collected gigs from source"
              );
              allGigs.push(...stamped);
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

        // Persist the extraction cache once, now that all sources have extracted.
        await this.llm.flushCache?.();

        // Fold the run's cache tallies into the stats summary.
        const cacheStats = this.llm.getCacheStats?.();
        if (cacheStats) {
          stats.pagesFromCache = cacheStats.pagesFromCache;
          stats.pagesToGemini = cacheStats.pagesToGemini;
        }

        // Collapse cross-source duplicates (same event listed by venue + aggregators)
        const dedupedGigs = this.dedupeGigs(allGigs, sources);
        stats.gigsExtracted = dedupedGigs.length;
        logger.info(
          { raw: allGigs.length, deduped: dedupedGigs.length },
          "Extracted gigs across all sources (deduped)"
        );

        if (dedupedGigs.length === 0) {
          logger.warn("No gigs extracted, sync complete (existing gigs left untouched)");
        } else {
          // Note: we deliberately do NOT pre-validate event URLs with HEAD requests.
          // Ticketing/aggregator sites reject or stall HEAD (timeouts), which silently
          // dropped most valid event links. The URLs come from pages we just scraped, so
          // we trust them; the occasional dead link is fixable in the CMS.

          // Upsert into the CMS. Manual and tombstoned (hidden/cancelled) gigs are left
          // exactly as the human left them. An unchanged gig is only heartbeated (its
          // lastSeenAt refreshed) so updatedAt stays a truthful "content changed" signal.
          const nowIso = new Date().toISOString();
          const seenDocIds: string[] = [];
          for (const gig of dedupedGigs) {
            try {
              const existing = await this.gigs.findExistingGig(gig);

              if (existing?.manual) {
                logger.info(
                  { title: gig.title, date: gig.date },
                  "Leaving hand-edited (manual) gig untouched"
                );
                stats.gigsSkippedManual++;
                continue;
              }

              if (existing && (existing.status === "hidden" || existing.status === "cancelled")) {
                logger.info(
                  { title: gig.title, status: existing.status },
                  "Leaving removed (tombstoned) gig untouched"
                );
                stats.gigsSkippedTombstoned++;
                continue;
              }

              const venueId = await this.gigs.getOrCreateVenue(gig.venueName);

              if (existing) {
                // The matcher tolerates title drift (subset billings, small typos), so
                // keep the stored display title unless this run's is strictly fuller -
                // adopting every source's rewording would flip-flop titles run over run.
                const toWrite =
                  gig.title !== existing.title &&
                  !isStrictSubset(titleTokens(existing.title), titleTokens(gig.title))
                    ? { ...gig, title: existing.title }
                    : gig;
                if (this.gigChanged(existing, toWrite)) {
                  await this.gigs.updateGig(existing.documentId, toWrite, venueId, {
                    manual: false,
                    status: "active",
                    lastSeenAt: nowIso,
                  });
                  stats.gigsUpdated++;
                  affected.updated.push(this.gigLabel(toWrite));
                } else {
                  seenDocIds.push(existing.documentId);
                }
              } else {
                await this.gigs.createGig(gig, venueId);
                stats.gigsCreated++;
                affected.created.push(this.gigLabel(gig));
              }
            } catch (error) {
              logger.error({ gig: gig.title, error }, "Failed to store gig");
              stats.errors++;
            }
          }

          // Heartbeat the unchanged-but-seen gigs in one call (refreshes lastSeenAt,
          // re-activates any that had been hidden) without bumping updatedAt.
          if (seenDocIds.length > 0) {
            try {
              stats.gigsSeen = await this.gigs.markSeen(seenDocIds);
            } catch (error) {
              logger.error({ error }, "Heartbeat (markSeen) failed (non-fatal)");
            }
          }
        }
      }

      logger.info({ stats }, "=== Sync Complete ===");
      await this.recordRun(startedIso, options, stats, affected, "completed");
      return stats;
    } catch (error) {
      logger.error({ error }, "Fatal error during sync");
      stats.errors++;
      await this.recordRun(
        startedIso,
        options,
        stats,
        affected,
        "failed",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /** Stamp the source id and a stable per-event key (its specific event URL) onto a gig. */
  private stampProvenance(source: GigSource, gig: Gig): Gig {
    const isSpecific = !!gig.url && !source.listingUrls.includes(gig.url);
    const sourceKey = isSpecific ? gig.url!.split("#")[0].replace(/\/+$/, "") : undefined;
    return { ...gig, source: source.id, sourceKey };
  }

  /**
   * True if the extracted gig differs from what's stored in a way a partial update would
   * actually change. Fields the crawler leaves undefined are ignored (a partial update
   * omits them, preserving the stored value), so unchanged gigs don't churn updatedAt.
   */
  private gigChanged(existing: StoredGig, gig: Gig): boolean {
    if (existing.title !== gig.title) {
      return true;
    }
    if (existing.date.toISOString() !== gig.date.toISOString()) {
      return true;
    }
    if (
      normalizeVenueName(existing.venueName).toLowerCase() !==
      normalizeVenueName(gig.venueName).toLowerCase()
    ) {
      return true;
    }
    if (JSON.stringify(existing.genres ?? []) !== JSON.stringify(gig.genres ?? [])) {
      return true;
    }
    if (gig.price !== undefined && (existing.price ?? undefined) !== gig.price) {
      return true;
    }
    if (gig.description !== undefined && (existing.description ?? undefined) !== gig.description) {
      return true;
    }
    if (gig.url !== undefined && (existing.url ?? undefined) !== gig.url) {
      return true;
    }
    if (gig.source !== undefined && (existing.source ?? undefined) !== gig.source) {
      return true;
    }
    if (gig.sourceKey !== undefined && (existing.sourceKey ?? undefined) !== gig.sourceKey) {
      return true;
    }
    return false;
  }

  private gigLabel(gig: Gig): string {
    return `${gig.title} (${gig.date.toISOString().slice(0, 10)})`;
  }

  private async recordRun(
    startedAt: string,
    options: SyncOptions,
    stats: SyncStats,
    affected: { created: string[]; updated: string[] },
    status: "completed" | "failed",
    error?: string
  ): Promise<void> {
    await this.gigs.recordSyncRun({
      startedAt,
      finishedAt: new Date().toISOString(),
      trigger: options.trigger ?? "manual",
      status,
      counts: { ...stats },
      affected,
      error,
    });
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
        genres: base.genres ?? other.genres,
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

    // Pass 2: within the same day+venue, collapse titles that name the same event - a
    // billing that is a token-subset of a fuller one ("Megadeth" into "Megadeth /
    // Sepultura") or a small-typo variant ("MONSIER MINIMAL") - keeping the fuller title.
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
        const hostIdx = kept.findIndex((k) => titlesLikelySame(k.title, gig.title));
        if (hostIdx >= 0) {
          kept[hostIdx] = merge(kept[hostIdx], gig, true); // keep fuller (host) title
        } else {
          kept.push(gig);
        }
      }
      result.push(...kept);
    }

    // Pass 3: collapse a recurring series listed once per date under the same event page
    // (identical normalized title + venue + specific event url across dates - e.g. a free
    // summer music series) into ONE upcoming entry, keeping the earliest future date. The
    // shared specific url is a strong "same event" signal, so this won't merge two distinct
    // same-named shows that each have their own page.
    const seriesKeyOf = (g: Gig): string | null =>
      g.url && !listingUrls.has(g.url)
        ? `${normalizeTitle(g.title)}|${normalizeVenueName(g.venueName).toLowerCase()}|${g.url}`
        : null;
    const chosen = new Map<string, Gig>();
    const order: Array<string | Gig> = [];
    for (const gig of result) {
      const key = seriesKeyOf(gig);
      if (!key) {
        order.push(gig);
        continue;
      }
      const prev = chosen.get(key);
      if (!prev) {
        chosen.set(key, gig);
        order.push(key);
      } else {
        const earliest = gig.date < prev.date ? gig : prev;
        const other = earliest === gig ? prev : gig;
        chosen.set(key, merge(earliest, other, true)); // keep earliest's date/title, backfill
      }
    }
    return order.map((o) => (typeof o === "string" ? chosen.get(o)! : o));
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
    // extracted straight from the listing - no detail-page discovery/scraping.
    if (source.listingOnly) {
      if (okListings.length === 0) {
        logger.warn({ source: source.id }, "No listing pages scraped for listing-only source");
        return [];
      }

      // Structured-listing sources (e.g. more.com) embed schema.org Event microdata in
      // the listing HTML - parse it deterministically instead of Readability + LLM.
      const parser = LISTING_PARSERS[source.id];
      if (parser) {
        const parsed = okListings.flatMap((p) =>
          p.rawHtml ? parser(p.rawHtml, p.url, dateRange) : []
        );
        logger.info(
          { source: source.id, gigs: parsed.length },
          "Extracted gigs from structured listing"
        );

        // Escalate events the coarse genre filter skipped (tagged "other") to the LLM:
        // scrape their detail pages and batch-extract, recovering acts the source's
        // tagging buries. The LLM's taste filter drops the genuine junk.
        let escalatedGigs: Gig[] = [];
        let escalatedPages: ScrapedContent[] = [];
        const otherExtractor = LISTING_OTHER_URL_EXTRACTORS[source.id];
        if (env.SYNC_ESCALATE_OTHER && otherExtractor) {
          const found = [
            ...new Set(
              okListings.flatMap((p) =>
                p.rawHtml ? otherExtractor(p.rawHtml, p.url, dateRange) : []
              )
            ),
          ];
          const otherUrls = found.slice(0, env.SYNC_MAX_DETAIL_PER_SOURCE);
          if (found.length > otherUrls.length) {
            logger.warn(
              { source: source.id, found: found.length, cap: env.SYNC_MAX_DETAIL_PER_SOURCE },
              "Capped 'other' escalation URLs - raise SYNC_MAX_DETAIL_PER_SOURCE to cover all"
            );
          }
          if (otherUrls.length > 0) {
            const scrapes = await this.scraper.scrapeMany(otherUrls);
            escalatedPages = scrapes.filter((s) => s.success);
            stats.detailUrlsFound += otherUrls.length;
            stats.detailPagesScraped += escalatedPages.length;
            escalatedGigs = await this.llm.extractGigsFromMultiplePages(escalatedPages, dateRange);
            logger.info(
              { source: source.id, otherUrls: otherUrls.length, kept: escalatedGigs.length },
              "Escalated 'other'-tagged listing events to the LLM"
            );
          }
        }

        // Fill missing prices; reuse the escalated detail HTML we just scraped (no re-fetch).
        return this.enrichMissingPrices(
          source,
          [...parsed, ...escalatedGigs],
          [...okListings, ...escalatedPages]
        );
      }

      let gigs = await this.llm.extractGigsFromMultiplePages(okListings, dateRange);

      // The gig "url" from a listing is the generic listing page. Upgrade it to a
      // per-event link found among the listing's hrefs (matched by title), or drop it -
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
      return this.enrichMissingPrices(source, gigs, okListings);
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

    // Fill any still-missing prices from detail pages (reusing the HTML we just scraped).
    return this.enrichMissingPrices(source, gigs, pagesToExtract);
  }

  /**
   * Fill in missing prices from event detail pages - a site- and city-agnostic fallback.
   * For each gig that has a specific event URL but no price, reuse the page HTML if we
   * already scraped it this run, otherwise fetch it once over HTTP, then run the generic
   * price extractor (JSON-LD offers -> microdata -> price/money elements). Deterministic,
   * no LLM call. Mainly benefits listing-only sources whose listing has no price (e.g.
   * more.com). Controlled by SYNC_ENRICH_PRICES.
   */
  private async enrichMissingPrices(
    source: GigSource,
    gigs: Gig[],
    scrapedPages: ScrapedContent[]
  ): Promise<Gig[]> {
    if (!env.SYNC_ENRICH_PRICES) {
      return gigs;
    }

    const listingUrlSet = new Set(source.listingUrls);
    const needing = gigs.filter((g) => !g.price && !!g.url && !listingUrlSet.has(g.url));
    if (needing.length === 0) {
      return gigs;
    }

    // HTML already in hand from this run's scrapes (avoids re-fetching detail pages).
    const htmlByUrl = new Map<string, string>();
    for (const page of scrapedPages) {
      if (page.success && page.rawHtml) {
        htmlByUrl.set(page.url, page.rawHtml);
      }
    }

    // Fetch only the detail pages we don't already have.
    const toFetch = [...new Set(needing.map((g) => g.url!))].filter((u) => !htmlByUrl.has(u));
    if (toFetch.length > 0) {
      const fetched = await this.scraper.scrapeMany(toFetch);
      for (const page of fetched) {
        if (page.success && page.rawHtml) {
          htmlByUrl.set(page.url, page.rawHtml);
        }
      }
    }

    let filled = 0;
    const enriched = gigs.map((g) => {
      if (g.price || !g.url) {
        return g;
      }
      const html = htmlByUrl.get(g.url);
      if (!html) {
        return g;
      }
      const price = extractPriceFromHtml(html);
      if (!price) {
        return g;
      }
      filled++;
      return { ...g, price };
    });

    if (toFetch.length > 0 || filled > 0) {
      logger.info(
        { source: source.id, missingPrice: needing.length, fetched: toFetch.length, filled },
        "Filled missing gig prices from detail pages"
      );
    }
    return enriched;
  }
}
