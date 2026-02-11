import axios from "axios";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import type { ScraperPort } from "../../ports/ScraperPort.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import { logger } from "../../utils/logger.js";

export class ReadabilityAdapter implements ScraperPort {
  /**
   * Extract all links from HTML that are from the same domain
   */
  private extractLinks(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const links = new Set<string>();

    $("a[href]").each((i, el) => {
      const href = $(el).attr("href");
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          // Only include links from same domain
          if (
            new URL(absoluteUrl).hostname === new URL(baseUrl).hostname
          ) {
            links.add(absoluteUrl);
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }
    });

    return Array.from(links);
  }

  async scrape(url: string): Promise<ScrapedContent> {
    logger.info({ url }, "Scraping URL");

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; GigCrawler/2.0; +https://athensears.gr)",
        },
        timeout: 30000,
      });

      const html = response.data;

      // Extract links with Cheerio
      const links = this.extractLinks(html, url);
      logger.info({ url, linkCount: links.length }, "Extracted links");

      // Create a virtual console that suppresses JSDOM errors
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("error", () => {
        // Suppress JSDOM CSS parsing errors
      });

      // Parse with Readability (disable CSS processing to avoid errors)
      const dom = new JSDOM(html, {
        url,
        virtualConsole,
        resources: "usable",
        runScripts: undefined, // Don't run scripts
      });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article && article.textContent) {
        const text = article.textContent.trim();
        logger.info({ url, textLength: text.length }, "Extracted text");
        return {
          url,
          text,
          rawHtml: html,
          success: true,
          links,
        };
      } else {
        logger.warn({ url }, "No text extracted, keeping raw HTML");
        return {
          url,
          text: undefined,
          rawHtml: html,
          success: true,
          links,
        };
      }
    } catch (error) {
      logger.error({ url, error }, "Failed to scrape");
      return {
        url,
        text: undefined,
        rawHtml: undefined,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async scrapeMany(urls: string[]): Promise<ScrapedContent[]> {
    logger.info({ count: urls.length }, "Scraping multiple URLs concurrently");

    const results = await Promise.all(urls.map((url) => this.scrape(url)));

    const successful = results.filter((r) => r.success).length;
    logger.info(
      { successful, total: urls.length },
      "Completed scraping multiple URLs"
    );

    return results;
  }
}
