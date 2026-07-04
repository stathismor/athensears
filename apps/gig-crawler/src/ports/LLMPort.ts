import type { ScrapedContent } from "../models/scrapedContent.js";
import type { Gig } from "../models/gig.js";

export interface LLMPort {
  /**
   * Extract structured gig data from multiple scraped pages in one call.
   */
  extractGigsFromMultiplePages(
    scrapedContents: ScrapedContent[],
    dateRange?: { startDate: string; endDate: string }
  ): Promise<Gig[]>;

  /**
   * Filter links found on a listing page down to event detail URLs.
   */
  filterEventDetailUrls(
    links: string[],
    pageContext: { url: string; title?: string }
  ): Promise<string[]>;

  /**
   * Prepare the extraction cache for a run. Called once before a sync; optional so
   * implementations without a cache need not provide it. Pass `useCache: false` to
   * bypass the cache entirely for this run (no reads, no writes).
   */
  loadCache?(useCache: boolean): Promise<void>;

  /** Persist the extraction cache. Called once after a sync run. */
  flushCache?(): Promise<void>;

  /** Per-run page tallies: pages replayed from cache vs sent to the LLM. */
  getCacheStats?(): { pagesFromCache: number; pagesToGemini: number };
}
