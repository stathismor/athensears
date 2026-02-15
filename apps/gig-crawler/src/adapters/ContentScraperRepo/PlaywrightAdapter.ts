import { chromium, type Browser } from "playwright";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ScraperPort } from "../../ports/ScraperPort.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import { env } from "../../models/env.js";
import { logger } from "../../utils/logger.js";

export class PlaywrightAdapter implements ScraperPort {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (this.browser) return Promise.resolve(this.browser);
    if (!this.launching) {
      this.launching = (async () => {
        logger.info("Launching browser");
        this.browser = await chromium.launch({
          args: [
            "--disable-http2",
            "--disable-blink-features=AutomationControlled",
          ],
        });
        this.launching = null;
        return this.browser;
      })();
    }
    return this.launching;
  }

  async close(): Promise<void> {
    if (this.launching) await this.launching;
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
            if (!href) continue;
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

      // Extract article text with JSDOM + Readability
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("error", () => {});

      const dom = new JSDOM(html, { url, virtualConsole });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.content) {
        // Convert <a href="url">text</a> → text (url) to preserve link URLs for the LLM
        const textWithLinks = article.content
          .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        logger.info({ url, textLength: textWithLinks.length }, "Extracted text");
        return { url, text: textWithLinks, rawHtml: html, success: true, links };
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
    logger.info(
      { count: urls.length, concurrency },
      "Scraping multiple URLs concurrently"
    );

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
    logger.info(
      { successful, total: urls.length },
      "Completed scraping multiple URLs"
    );

    return results;
  }
}
