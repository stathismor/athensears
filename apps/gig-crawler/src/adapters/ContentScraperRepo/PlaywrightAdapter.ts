import { chromium, type Browser } from "playwright";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ScraperPort } from "../../ports/ScraperPort.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import { env } from "../../models/env.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Hosts that serve fine over plain HTTP but block/stall headless Chromium
// (e.g. more.com is server-rendered ASP.NET but hangs a headless browser).
// For these we fetch HTML directly first and fall back to the browser.
const HTTP_FIRST_HOSTS = ["more.com"];

const TICKET_DOMAINS = [
  "more.com",
  "viva.gr",
  "ticketservices.gr",
  "ticketmaster.gr",
  "eventbrite.com",
];
const TICKET_KEYWORDS = ["ticket", "buy", "αγορ", "εισιτ", "biliet"];

/**
 * Fetch a URL following redirects while carrying cookies across hops.
 *
 * Many sites sit behind bot gates (e.g. more.com's Queue-It "Safenet") that 302 to a
 * challenge which sets a clearance cookie and bounces back to the page. The clearance
 * only sticks if the client resends that cookie - a browser (or curl -c/-b) does, but
 * the plain fetch redirect follower drops cookies between hops, so it loops until
 * "redirect count exceeded". We follow redirects manually with a small in-request
 * cookie jar so the clearance cookie is resent and the chain resolves. The jar is not
 * persisted beyond this call.
 */
async function fetchFollowingRedirects(
  startUrl: string,
  init: { headers: Record<string, string>; timeoutMs: number; maxRedirects?: number }
): Promise<Response> {
  const { headers, timeoutMs, maxRedirects = 20 } = init;
  const jar = new Map<string, string>();
  let current = startUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const reqHeaders: Record<string, string> = { ...headers };
    if (jar.size > 0) {
      reqHeaders.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(current, {
      headers: reqHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Accumulate Set-Cookie values as name=value (domain/path/expiry ignored - this
    // jar lives only for the duration of one page fetch).
    const resHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies =
      typeof resHeaders.getSetCookie === "function"
        ? resHeaders.getSetCookie()
        : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
    for (const sc of setCookies) {
      const pair = sc.split(";", 1)[0];
      const eq = pair.indexOf("=");
      if (eq > 0) {
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return res;
      }
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("redirect count exceeded");
}

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

/** Same-domain links from a parsed document (used by the HTTP-fetch path). */
function linksFromDoc(doc: Document, baseUrl: string): string[] {
  const baseHostname = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
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
}

/** Ticket links from a parsed document (used by the HTTP-fetch path). */
function ticketLinksFromDoc(doc: Document, baseUrl: string): string[] {
  const results: string[] = [];
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href) {
      continue;
    }
    try {
      const abs = new URL(href, baseUrl).toString();
      const hostname = new URL(abs).hostname;
      const text = (a.textContent || "").toLowerCase();
      const isTicketDomain = TICKET_DOMAINS.some((d) => hostname.includes(d));
      const isTicketText = TICKET_KEYWORDS.some(
        (k) => text.includes(k) || href.toLowerCase().includes(k)
      );
      if (isTicketDomain || isTicketText) {
        results.push(`${a.textContent?.trim() || "Ticket"}: ${abs}`);
      }
    } catch {
      // skip invalid URLs
    }
  }
  return results;
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
    const host = new URL(url).hostname;
    const httpFirst = HTTP_FIRST_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

    if (httpFirst) {
      // These hosts block/stall headless Chromium by definition, so a browser
      // fallback would just waste ~60s timing out - return the HTTP result as-is.
      return this.scrapeViaHttp(url);
    }

    const viaBrowser = await this.scrapeViaBrowser(url);
    if (viaBrowser.success) {
      return viaBrowser;
    }
    // Many sites block headless Chromium but serve fine over plain HTTP
    logger.warn({ url }, "Browser scrape failed, falling back to HTTP fetch");
    const viaHttp = await this.scrapeViaHttp(url);
    return viaHttp.success ? viaHttp : viaBrowser;
  }

  /** Plain HTTP fetch with a real-browser UA - for server-rendered/anti-headless sites. */
  private async scrapeViaHttp(url: string): Promise<ScrapedContent> {
    logger.info({ url }, "Scraping URL (http)");
    try {
      // Retry the network fetch: under concurrent scraping these hosts intermittently
      // throw transient DNS/connection errors (e.g. EAI_AGAIN) or 5xx, which a short
      // backoff clears. A single flaky fetch otherwise silently drops a whole source.
      const html = await retry(
        async () => {
          const res = await fetchFollowingRedirects(url, {
            headers: {
              "User-Agent": BROWSER_UA,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en,el;q=0.9",
            },
            timeoutMs: 20000,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.text();
        },
        {
          maxAttempts: 3,
          initialDelay: 1500,
          onError: (error, attempt) =>
            logger.warn({ url, attempt, error }, "HTTP fetch attempt failed, retrying"),
        }
      );
      // Parse once and reuse the document for links + Readability (these pages
      // can be >1MB, so repeated JSDOM parses are the dominant cost).
      const vc = new VirtualConsole();
      vc.on("error", () => {});
      const doc = new JSDOM(html, { url, virtualConsole: vc }).window.document;
      const links = linksFromDoc(doc, url);
      const ticketLinks = ticketLinksFromDoc(doc, url);
      logger.info({ url, linkCount: links.length }, "Extracted links (http)");
      return this.buildContent(url, html, links, ticketLinks, doc);
    } catch (error) {
      logger.error({ url, error }, "Failed to scrape (http)");
      return {
        url,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Headless-browser scrape - for JS-rendered sites. */
  private async scrapeViaBrowser(url: string): Promise<ScrapedContent> {
    logger.info({ url }, "Scraping URL (browser)");

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Load fast on DOMContentLoaded (our sources are server-rendered), then give
      // lazy content a brief moment to settle - but cap that at 6s instead of paying
      // the full 30s networkidle timeout that rarely settles (analytics/ads keep it busy).
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});

      const html = await page.content();
      const baseHostname = new URL(url).hostname;

      // Extract same-domain links via Playwright (captures JS-rendered links)
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

      // Extract external ticket links via Playwright (Readability often strips these)
      const ticketLinks = await page.$$eval(
        "a[href]",
        (anchors, { baseUrl, ticketDomains, ticketKeywords }) => {
          const results: string[] = [];
          for (const a of anchors) {
            const href = a.getAttribute("href");
            if (!href) {
              continue;
            }
            try {
              const abs = new URL(href, baseUrl).toString();
              const hostname = new URL(abs).hostname;
              const text = (a.textContent || "").toLowerCase();
              const isTicketDomain = ticketDomains.some((d) => hostname.includes(d));
              const isTicketText = ticketKeywords.some(
                (k) => text.includes(k) || href.toLowerCase().includes(k)
              );
              if (isTicketDomain || isTicketText) {
                results.push(`${a.textContent?.trim() || "Ticket"}: ${abs}`);
              }
            } catch {
              // skip invalid URLs
            }
          }
          return results;
        },
        { baseUrl: url, ticketDomains: TICKET_DOMAINS, ticketKeywords: TICKET_KEYWORDS }
      );

      return this.buildContent(url, html, links, ticketLinks);
    } catch (error) {
      logger.error({ url, error }, "Failed to scrape (browser)");
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

  /** Shared: turn raw HTML + extracted links into a ScrapedContent (structured data + Readability). */
  private buildContent(
    url: string,
    html: string,
    links: string[],
    ticketLinks: string[],
    preParsedDoc?: Document
  ): ScrapedContent {
    const structuredData = extractStructuredData(html);

    let doc = preParsedDoc;
    if (!doc) {
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("error", () => {});
      doc = new JSDOM(html, { url, virtualConsole }).window.document;
    }
    // Readability mutates the document, so links must already be extracted by now.
    const reader = new Readability(doc);
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
      const ticketSection =
        ticketLinks.length > 0 ? `\n\n[Ticket Links]\n${ticketLinks.join("\n")}` : "";
      const text = structuredData
        ? `[Structured Data]\n${structuredData}\n\n[Page Content]\n${textWithLinks}${ticketSection}`
        : `${textWithLinks}${ticketSection}`;
      logger.info(
        { url, textLength: text.length, hasStructuredData: !!structuredData },
        "Extracted text"
      );
      return { url, text, rawHtml: html, success: true, links };
    }

    logger.warn({ url }, "No text extracted, keeping raw HTML");
    return { url, text: undefined, rawHtml: html, success: true, links };
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
