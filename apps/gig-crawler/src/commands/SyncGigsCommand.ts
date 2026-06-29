import type { ScraperPort } from "../ports/ScraperPort.js";
import type { LLMPort } from "../ports/LLMPort.js";
import type { GigsPort } from "../ports/GigsPort.js";
import type { Gig } from "../models/gig.js";
import { activeSources, type GigSource } from "../models/sources.js";
import { logger } from "../utils/logger.js";
import { env } from "../models/env.js";

export interface SyncStats {
  sources: number;
  listingPagesScraped: number;
  detailUrlsFound: number;
  detailPagesScraped: number;
  gigsExtracted: number;
  gigsCreated: number;
  gigsUpdated: number;
  gigsSkippedManual: number;
  errors: number;
}

/** Cap detail pages crawled per source — keeps cost bounded and diversifies coverage. */
const MAX_DETAIL_PAGES_PER_SOURCE = 30;

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

      // Collect gigs source by source (so we can stamp the known venue per source)
      const allGigs: Gig[] = [];
      for (const source of sources) {
        try {
          const sourceGigs = await this.collectFromSource(source, dateRange, stats);
          logger.info({ source: source.id, gigs: sourceGigs.length }, "Collected gigs from source");
          allGigs.push(...sourceGigs);
        } catch (error) {
          logger.error({ source: source.id, error }, "Failed to collect from source");
          stats.errors++;
        }
      }

      stats.gigsExtracted = allGigs.length;
      logger.info({ count: allGigs.length }, "Extracted total gigs across all sources");

      if (allGigs.length === 0) {
        logger.warn("No gigs extracted, sync complete (existing gigs left untouched)");
        return stats;
      }

      // Keep gigs whose ticket URL is broken — just drop the dead link (frontend
      // falls back to the venue website). Never discard the gig itself.
      const validatedGigs = await this.validateUrls(allGigs);

      // Upsert into the CMS
      for (const gig of validatedGigs) {
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

      logger.info({ stats }, "=== Sync Complete ===");
      return stats;
    } catch (error) {
      logger.error({ error }, "Fatal error during sync");
      stats.errors++;
      throw error;
    }
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
    const detailList = [...detailUrls].slice(0, MAX_DETAIL_PAGES_PER_SOURCE);
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

  /** HEAD-check ticket URLs in parallel; clear dead ones but keep the gig. */
  private async validateUrls(gigs: Gig[]): Promise<Gig[]> {
    const validated = await Promise.all(
      gigs.map(async (gig) => {
        if (!gig.url) {
          return gig;
        }
        try {
          const res = await fetch(gig.url, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            return gig;
          }
          logger.warn(
            { title: gig.title, url: gig.url, status: res.status },
            "Clearing broken gig URL"
          );
        } catch {
          logger.warn({ title: gig.title, url: gig.url }, "Clearing unreachable gig URL");
        }
        return { ...gig, url: undefined };
      })
    );
    return validated;
  }
}
