import type { ScrapedContent } from "../models/scrapedContent.js";

export interface ScraperPort {
  scrape(url: string): Promise<ScrapedContent>;
  scrapeMany(urls: string[]): Promise<ScrapedContent[]>;
}
