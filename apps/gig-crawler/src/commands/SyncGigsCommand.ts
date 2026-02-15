import type { SearchPort } from '../ports/SearchPort.js';
import type { SearchOptions } from '../ports/SearchPort.js';
import type { ScraperPort } from '../ports/ScraperPort.js';
import type { LLMPort } from '../ports/LLMPort.js';
import type { GigsPort } from '../ports/GigsPort.js';
import type { Gig } from '../models/gig.js';
import type { SearchResult } from '../models/searchResult.js';
import { logger } from '../utils/logger.js';

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
    logger.info('Starting gig sync (three-pass approach with auto-detection)');

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

      // Step 1: Search with Brave using multiple focused queries
      const queries: { query: string; options: SearchOptions }[] = [
        {
          query: 'συναυλίες Αθήνα 2026',
          options: { country: 'GR', searchLang: 'el', extraSnippets: true },
        },
        {
          query: 'rock metal alternative concerts Athens Greece 2026',
          options: { country: 'GR', extraSnippets: true },
        },
        {
          query: 'live music Athens venues upcoming shows 2026',
          options: { country: 'GR', extraSnippets: true },
        },
      ];

      const allResults: SearchResult[] = [];
      for (let i = 0; i < queries.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1100));
        const { query, options } = queries[i];
        const results = await this.search.search(query, 20, options);
        allResults.push(...results);
      }

      // Deduplicate by URL
      const seen = new Set<string>();
      const searchResults = allResults.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

      stats.searchResults = searchResults.length;
      logger.info(
        {
          count: searchResults.length,
          urls: searchResults.map(r => r.url)
        },
        'Found search results (merged and deduplicated)'
      );

      if (searchResults.length === 0) {
        logger.warn('No search results found, aborting sync');
        return stats;
      }

      // Step 2: Filter promising URLs with Gemini
      const promisingUrls = await this.llm.filterPromisingUrls(searchResults);
      const hardcodedUrls = [
        'https://www.more.com/music/concerts/',
        'https://www.more.com/gr-el/tickets/music/',
      ];
      for (const url of hardcodedUrls) {
        if (!promisingUrls.includes(url)) {
          promisingUrls.push(url);
        }
      }
      stats.filteredUrls = promisingUrls.length;
      logger.info(
        {
          count: promisingUrls.length,
          urls: promisingUrls
        },
        'Filtered to promising URLs'
      );

      if (promisingUrls.length === 0) {
        logger.warn('No promising URLs found, aborting sync');
        return stats;
      }

      // PASS 2: Link Extraction (NEW)
      logger.info('=== PASS 2: Link Extraction ===');

      const scrapedListingPages = await this.scraper.scrapeMany(promisingUrls);
      const successfulScrapes = scrapedListingPages.filter((sc) => sc.success);
      logger.info({ count: successfulScrapes.length }, 'Successfully scraped listing pages');

      // Collect all event detail URLs
      const allEventDetailUrls: string[] = [];

      for (const scrapedPage of successfulScrapes) {
        if (scrapedPage.links && scrapedPage.links.length > 0) {
          // Page has links - likely a listing page
          logger.info(
            {
              url: scrapedPage.url,
              linkCount: scrapedPage.links.length,
            },
            'Found links on page, filtering for event details'
          );

          const eventUrls = await this.llm.filterEventDetailUrls(scrapedPage.links, {
            url: scrapedPage.url,
          });

          allEventDetailUrls.push(...eventUrls);
          logger.info(
            {
              url: scrapedPage.url,
              foundEventUrls: eventUrls.length,
            },
            'Extracted event detail URLs'
          );
        } else {
          // No links found - might already be a detail page
          logger.info(
            {
              url: scrapedPage.url,
            },
            'No links found, treating as potential detail page'
          );

          allEventDetailUrls.push(scrapedPage.url);
        }
      }

      // Deduplicate URLs
      const uniqueEventUrls = [...new Set(allEventDetailUrls)];
      logger.info({ count: uniqueEventUrls.length }, 'Total unique event detail URLs');

      if (uniqueEventUrls.length === 0) {
        logger.warn('No event detail URLs found, aborting sync');
        return stats;
      }

      // Shuffle URLs to get diversity from all sources (not just first source)
      const shuffledUrls = uniqueEventUrls.sort(() => Math.random() - 0.5);

      // Limit to first 100 URLs (increased from 20 for more gigs)
      const MAX_DETAIL_PAGES = 100;
      const limitedEventUrls = shuffledUrls.slice(0, MAX_DETAIL_PAGES);
      if (limitedEventUrls.length < uniqueEventUrls.length) {
        logger.info(
          { original: uniqueEventUrls.length, limited: limitedEventUrls.length },
          'Limited detail pages to process'
        );
      }

      // PASS 3: Detail Extraction
      logger.info('=== PASS 3: Detail Extraction ===');

      const scrapedDetailPages = await this.scraper.scrapeMany(limitedEventUrls);
      const successfulDetails = scrapedDetailPages.filter((sc) => sc.success);
      stats.scrapedUrls = successfulDetails.length;
      logger.info({ count: successfulDetails.length }, 'Successfully scraped detail pages');

      // Extract gigs from detail pages
      let allGigs: Gig[] = [];
      try {
        allGigs = await this.llm.extractGigsFromMultiplePages(successfulDetails);
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
          await this.gigs.createGig(gig, venueId);
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
