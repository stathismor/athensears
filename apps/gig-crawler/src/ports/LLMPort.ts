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
}
