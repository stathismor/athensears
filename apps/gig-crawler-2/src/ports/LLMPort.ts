import type { SearchResult } from "../models/searchResult.js";
import type { ScrapedContent } from "../models/scrapedContent.js";
import type { Gig } from "../models/gig.js";

export interface LLMPort {
  /**
   * Filter search results to promising URLs (Pass 1)
   */
  filterPromisingUrls(searchResults: SearchResult[]): Promise<string[]>;

  /**
   * Extract structured gig data from scraped content (Pass 2)
   */
  extractGigsFromContent(scrapedContent: ScrapedContent): Promise<Gig[]>;

  /**
   * Extract structured gig data from multiple scraped pages in one call (Pass 2 - Batch)
   */
  extractGigsFromMultiplePages(scrapedContents: ScrapedContent[]): Promise<Gig[]>;

  /**
   * Filter links to identify event detail URLs (Pass 2)
   */
  filterEventDetailUrls(
    links: string[],
    pageContext: { url: string; title?: string }
  ): Promise<string[]>;
}
