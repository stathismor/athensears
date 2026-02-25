import { chromium, type Browser } from "playwright";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ScraperPort } from "../../ports/ScraperPort.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import { env } from "../../models/env.js";
import { logger } from "../../utils/logger.js";

/**
 * Extract JSON-LD and OpenGraph metadata from raw HTML.
 * Returns a concise text summary for the LLM, or undefined if nothing useful found.
 */
function extractStructuredData(html: string): string | undefined {
  const parts: string[] = [];

  // Extract JSON-LD blocks
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        // Only include event-related structured data
        const type = (item["@type"] || "").toLowerCase();
        if (type.includes("event") || type.includes("musicevent") || type.includes("concert")) {
          const lines: string[] = [];
          if (item.name) {
            lines.push(`Event: ${item.name}`);
          }
          if (item.startDate) {
            lines.push(`Date: ${item.startDate}`);
          }
          if (item.endDate && item.endDate !== item.startDate) {
            lines.push(`End Date: ${item.endDate}`);
          }
          if (item.location?.name) {
            lines.push(`Venue: ${item.location.name}`);
          }
          if (item.location?.address?.addressLocality) {
            lines.push(`City: ${item.location.address.addressLocality}`);
          }
          if (item.performer) {
            const performers = Array.isArray(item.performer) ? item.performer : [item.performer];
            const names = performers.map((p: any) => p.name).filter(Boolean);
            if (names.length) {
              lines.push(`Performers: ${names.join(", ")}`);
            }
          }
          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const offer of offers) {
              if (offer.price) {
                lines.push(`Price: ${offer.priceCurrency || ""}${offer.price}`);
              }
              if (offer.url) {
                lines.push(`Ticket URL: ${offer.url}`);
              }
            }
          }
          if (item.description) {
            lines.push(`Description: ${item.description}`);
          }
          if (lines.length) {
            parts.push(lines.join("\n"));
          }
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  }

  // Extract OpenGraph tags as fallback
  if (parts.length === 0) {
    const ogTags: Record<string, string> = {};
    const ogRegex =
      /<meta[^>]*property=["'](og:[^"']+)["'][^>]*content=["']([^"']+)["'][^>]*\/?>/gi;
    while ((match = ogRegex.exec(html)) !== null) {
      ogTags[match[1]] = match[2];
    }
    if (ogTags["og:title"]) {
      const lines: string[] = [];
      lines.push(`Title: ${ogTags["og:title"]}`);
      if (ogTags["og:description"]) {
        lines.push(`Description: ${ogTags["og:description"]}`);
      }
      if (ogTags["og:locality"]) {
        lines.push(`City: ${ogTags["og:locality"]}`);
      }
      parts.push(lines.join("\n"));
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export class PlaywrightAdapter implements ScraperPort {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (this.browser) {
      return Promise.resolve(this.browser);
    }
    if (!this.launching) {
      this.launching = (async () => {
        logger.info("Launching browser");
        this.browser = await chromium.launch({
          args: ["--disable-http2", "--disable-blink-features=AutomationControlled"],
        });
        this.launching = null;
        return this.browser;
      })();
    }
    return this.launching;
  }

  async close(): Promise<void> {
    if (this.launching) {
      await this.launching;
    }
    if (this.browser) {
      logger.info("Closing browser");
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrape(url: string): Promise<ScrapedContent> {
    logger.info({ url }, "Scraping URL");

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      } catch {
        logger.warn({ url }, "networkidle failed, retrying with domcontentloaded");
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }

      const html = await page.content();

      // Extract same-domain links via Playwright
      const baseHostname = new URL(url).hostname;
      const links = await page.$$eval(
        "a[href]",
        (anchors, { baseUrl, baseHostname }) => {
          const seen = new Set<string>();
          for (const a of anchors) {
            const href = a.getAttribute("href");
            if (!href) {
              continue;
            }
            try {
              const abs = new URL(href, baseUrl).toString();
              if (new URL(abs).hostname === baseHostname) {
                seen.add(abs);
              }
            } catch {
              // skip invalid URLs
            }
          }
          return [...seen];
        },
        { baseUrl: url, baseHostname }
      );

      logger.info({ url, linkCount: links.length }, "Extracted links");

      // Extract structured data (JSON-LD, OpenGraph) before Readability
      const structuredData = extractStructuredData(html);

      // Extract article text with JSDOM + Readability
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("error", () => {});

      const dom = new JSDOM(html, { url, virtualConsole });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.content) {
        // Convert <a href="url">text</a> → text (url) to preserve link URLs for the LLM
        const textWithLinks = article.content
          .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Prepend structured data so the LLM always sees event metadata
        const text = structuredData
          ? `[Structured Data]\n${structuredData}\n\n[Page Content]\n${textWithLinks}`
          : textWithLinks;
        logger.info(
          { url, textLength: text.length, hasStructuredData: !!structuredData },
          "Extracted text"
        );
        return { url, text, rawHtml: html, success: true, links };
      }

      logger.warn({ url }, "No text extracted, keeping raw HTML");
      return { url, text: undefined, rawHtml: html, success: true, links };
    } catch (error) {
      logger.error({ url, error }, "Failed to scrape");
      return {
        url,
        text: undefined,
        rawHtml: undefined,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await page.close();
    }
  }

  async scrapeMany(urls: string[]): Promise<ScrapedContent[]> {
    const concurrency = parseInt(env.SCRAPER_CONCURRENCY, 10);
    logger.info({ count: urls.length, concurrency }, "Scraping multiple URLs concurrently");

    const results: ScrapedContent[] = new Array(urls.length);
    let next = 0;

    async function worker(this: PlaywrightAdapter) {
      while (next < urls.length) {
        const idx = next++;
        results[idx] = await this.scrape(urls[idx]);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () =>
      worker.call(this)
    );
    await Promise.all(workers);

    const successful = results.filter((r) => r.success).length;
    logger.info({ successful, total: urls.length }, "Completed scraping multiple URLs");

    return results;
  }
}
