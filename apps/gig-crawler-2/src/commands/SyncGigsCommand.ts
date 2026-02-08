import type { SearchPort } from '../ports/SearchPort.js';
import type { ScraperPort } from '../ports/ScraperPort.js';
import type { LLMPort } from '../ports/LLMPort.js';
import type { GigsPort } from '../ports/GigsPort.js';
import type { Gig } from '../models/gig.js';
import { logger } from '../utils/logger.js';
import { getDateRangeQuery } from '../utils/dateUtils.js';

export interface SyncStats {
  searchResults: number;
  filteredUrls: number;
  scrapedUrls: number;
  gigsExtracted: number;
  gigsCreated: number;
  gigsSkipped: number;
  errors: number;
}

export class SyncGigsCommand {
  constructor(
    private readonly search: SearchPort,
    private readonly scraper: ScraperPort,
    private readonly llm: LLMPort,
    private readonly gigs: GigsPort
  ) {}

  async execute(options: { clearExisting?: boolean } = {}): Promise<SyncStats> {
    logger.info('Starting gig sync (two-pass approach)');

    const stats: SyncStats = {
      searchResults: 0,
      filteredUrls: 0,
      scrapedUrls: 0,
      gigsExtracted: 0,
      gigsCreated: 0,
      gigsSkipped: 0,
      errors: 0,
    };

    try {
      // Clear existing gigs if requested
      if (options.clearExisting) {
        logger.info('=== CLEARING EXISTING GIGS ===');
        const deletedCount = await this.gigs.deleteAllGigs();
        logger.info({ deletedCount }, 'Cleared existing gigs');
      }

      // PASS 1: Discovery
      logger.info('=== PASS 1: Discovery ===');

      // Step 1: Search with Brave
      const dateRange = getDateRangeQuery(30);
      const query = `Rock/indie/Folk/dark συναυλίες Αθήνα ${dateRange}`;

      const searchResults = await this.search.search(query, 20);
      stats.searchResults = searchResults.length;
      logger.info({ count: searchResults.length }, 'Found search results');

      if (searchResults.length === 0) {
        logger.warn('No search results found, aborting sync');
        return stats;
      }

      // Step 2: Filter promising URLs with Gemini
      const promisingUrls = await this.llm.filterPromisingUrls(searchResults);
      stats.filteredUrls = promisingUrls.length;
      logger.info({ count: promisingUrls.length }, 'Filtered to promising URLs');

      if (promisingUrls.length === 0) {
        logger.warn('No promising URLs found, aborting sync');
        return stats;
      }

      // PASS 2: Extraction
      logger.info('=== PASS 2: Extraction ===');

      // Step 3: Scrape URLs
      const scrapedContents = await this.scraper.scrapeMany(promisingUrls);
      const successfulScrapes = scrapedContents.filter((sc) => sc.success);
      stats.scrapedUrls = successfulScrapes.length;
      logger.info({ count: successfulScrapes.length }, 'Successfully scraped URLs');

      // Step 4: Extract gigs from ALL scraped pages in one batch call
      let allGigs: Gig[] = [];
      try {
        allGigs = await this.llm.extractGigsFromMultiplePages(scrapedContents);
      } catch (error) {
        logger.error({ error }, 'Failed to extract gigs from batch');
        stats.errors++;
      }

      stats.gigsExtracted = allGigs.length;
      logger.info({ count: allGigs.length }, 'Extracted total gigs');

      if (allGigs.length === 0) {
        logger.warn('No gigs extracted, sync complete');
        return stats;
      }

      // Step 5: Store gigs in Strapi (with deduplication)
      for (const gig of allGigs) {
        try {
          // Check if gig already exists
          const existingGigId = await this.gigs.findGig(gig.title, gig.date);
          if (existingGigId) {
            logger.info({ title: gig.title, date: gig.date }, 'Skipping duplicate gig');
            stats.gigsSkipped++;
            continue;
          }

          // Get or create venue
          const venueId = await this.gigs.getOrCreateVenue(gig.venueName);

          // Create gig
          const gigId = await this.gigs.createGig(gig, venueId);
          logger.info({ id: gigId, title: gig.title, date: gig.date }, 'Created gig');
          stats.gigsCreated++;
        } catch (error) {
          logger.error({ gig: gig.title, error }, 'Failed to store gig');
          stats.errors++;
        }
      }

      logger.info('=== Sync Complete ===');
      logger.info(
        {
          searchResults: stats.searchResults,
          filteredUrls: stats.filteredUrls,
          scrapedUrls: stats.scrapedUrls,
          gigsExtracted: stats.gigsExtracted,
          gigsCreated: stats.gigsCreated,
          gigsSkipped: stats.gigsSkipped,
          errors: stats.errors,
        },
        'Sync statistics'
      );

      return stats;
    } catch (error) {
      logger.error({ error }, 'Fatal error during sync');
      stats.errors++;
      throw error;
    }
  }
}
