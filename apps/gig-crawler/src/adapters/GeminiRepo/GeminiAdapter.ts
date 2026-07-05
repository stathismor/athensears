import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMPort } from "../../ports/LLMPort.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import type { Gig } from "../../models/gig.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { parseFlexibleDate } from "../../utils/dateUtils.js";
import { GIG_EXTRACTION_BATCH_PROMPT } from "../../prompts/gigExtractionBatch.js";
import { EVENT_LINK_FILTER_PROMPT } from "../../prompts/eventLinkFilter.js";
import { cleanEventTitle } from "../../utils/cleanTitle.js";
import { normalizePrice } from "../../utils/normalizePrice.js";
import { ACTIVE_CITY } from "../../models/city.js";
import { env } from "../../models/env.js";
import { PageExtractionCache } from "../CacheRepo/PageExtractionCache.js";

/**
 * Summarize a Gemini/fetch error into a single short line. Railway's log view
 * only renders the message string (structured fields are hidden), so we fold the
 * HTTP status + message in here - enough to tell an invalid key from a blocked
 * region/IP or a bad model without dumping a full stack trace.
 */
function geminiErrorSummary(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { status?: number; statusText?: string; message?: string };
    const status = [e.status, e.statusText].filter(Boolean).join(" ");
    const message = (e.message ?? "").split("\n")[0].slice(0, 200);
    return [status, message].filter(Boolean).join(" - ") || String(error);
  }
  return String(error);
}

/**
 * Normalize a genre string and decide whether the gig passes the taste filter.
 * The extraction prompt is instructed to set genre to "reject" for events that
 * don't fit (mainstream pop, EDM, comedy, theatre, tribute acts, etc.). This is
 * the code-side backstop: drop anything rejected or with no genre at all.
 */
function normalizeGenre(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || /^(reject|skip|none|n\/a)$/i.test(trimmed)) {
    return undefined;
  }
  // The model sometimes returns several genres ("Jazz, Free Jazz, Folk, ...") - keep the
  // first (its best single match) so we stay within the CMS `genre` field (maxLength 50).
  return trimmed
    .split(/\s*[,/|]\s*/)[0]
    .slice(0, 50)
    .trim();
}

function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  let url: string;
  if (/^https?:\/\//i.test(trimmed)) {
    url = trimmed;
  } else if (/^www\./i.test(trimmed)) {
    url = `https://${trimmed}`;
  } else if (/^[^\s]+\.[^\s]+/.test(trimmed)) {
    url = `https://${trimmed}`;
  } else {
    return undefined;
  }

  // Reject bare domains (no meaningful path)
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

/**
 * Reduce a scraped page to the { url, content } sent to the model. Uses Readability
 * text when available; falls back to tag-stripped raw HTML when the text is too short
 * (Readability failed). The content is capped so each page contributes a bounded
 * amount to the prompt. This is also the exact string hashed for the extraction cache,
 * so the same page always maps to the same cache key.
 */
function preparePageContent(sc: ScrapedContent): { url: string; content: string } {
  const MIN_TEXT_LENGTH = 1000;
  const CONTENT_LIMIT = 5000;
  const text = sc.text || "";
  const useRawHtml = text.length < MIN_TEXT_LENGTH && sc.rawHtml;

  if (useRawHtml) {
    const htmlContent = sc
      .rawHtml!.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
      .replace(/<[^>]+>/g, " ") // Remove HTML tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
    return { url: sc.url, content: htmlContent.slice(0, CONTENT_LIMIT) };
  }

  return { url: sc.url, content: text.slice(0, CONTENT_LIMIT) };
}

/** Whether a gig date falls inside the (inclusive) crawl window. */
function isWithinRange(date: Date, dateRange?: { startDate: string; endDate: string }): boolean {
  if (!dateRange) {
    return true;
  }
  const day = date.toISOString().slice(0, 10);
  return day >= dateRange.startDate && day <= dateRange.endDate;
}

/**
 * Turn the model's raw gig objects into validated Gig records, applying the same
 * date-range, date-validity and genre/taste backstops the extractor has always used.
 */
function buildGigsFromData(
  rawGigs: unknown,
  dateRange?: { startDate: string; endDate: string }
): Gig[] {
  if (!Array.isArray(rawGigs)) {
    return [];
  }
  const gigs: Gig[] = [];
  for (const gigData of rawGigs) {
    try {
      const date = parseFlexibleDate(gigData.date);
      if (!date) {
        logger.warn({ gig: gigData }, "Skipping gig with invalid date");
        continue;
      }

      if (!isWithinRange(date, dateRange)) {
        logger.debug(
          { title: gigData.title, date: date.toISOString().slice(0, 10) },
          "Skipping gig outside date range"
        );
        continue;
      }

      // Taste backstop: drop anything the model rejected or left ungenred
      const genre = normalizeGenre(gigData.genre);
      if (!genre) {
        logger.debug(
          { title: gigData.title, rawGenre: gigData.genre },
          "Skipping gig that failed the genre/taste filter"
        );
        continue;
      }

      const venueName = gigData.venue_name || "Unknown Venue";
      gigs.push({
        title: cleanEventTitle(gigData.title, venueName, ACTIVE_CITY.nameAliases),
        date,
        venueName,
        description: gigData.description,
        price: normalizePrice(gigData.price),
        url: normalizeUrl(gigData.url) || normalizeUrl(gigData.ticket_url) || "",
        genre,
        imageUrl: gigData.image_url,
      });
    } catch (error) {
      logger.warn({ error, gigData }, "Failed to parse gig");
    }
  }
  return gigs;
}

export class GeminiAdapter implements LLMPort {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;
  private readonly cache: PageExtractionCache;
  // Per-run page tallies (reset on loadCache): pages replayed from cache vs sent to Gemini.
  private runPagesFromCache = 0;
  private runPagesToGemini = 0;

  constructor(
    apiKey: string = env.GEMINI_API_KEY,
    model: string = env.GEMINI_MODEL,
    cache: PageExtractionCache = new PageExtractionCache()
  ) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.cache = cache;
  }

  /** Prepare the extraction cache for a run. Call once at the start of a sync run. */
  async loadCache(useCache: boolean): Promise<void> {
    this.runPagesFromCache = 0;
    this.runPagesToGemini = 0;
    await this.cache.load(useCache);
  }

  /** Persist the extraction cache. Call once at the end of a sync run. */
  async flushCache(): Promise<void> {
    await this.cache.flush();
  }

  /** Per-run page tallies: pages replayed from cache vs sent to Gemini. */
  getCacheStats(): { pagesFromCache: number; pagesToGemini: number } {
    return { pagesFromCache: this.runPagesFromCache, pagesToGemini: this.runPagesToGemini };
  }

  async extractGigsFromMultiplePages(
    scrapedContents: ScrapedContent[],
    dateRange?: { startDate: string; endDate: string }
  ): Promise<Gig[]> {
    const successfulPages = scrapedContents.filter((sc) => sc.success && sc.text);

    if (successfulPages.length === 0) {
      logger.warn("No successful pages to extract from");
      return [];
    }

    // Split pages into cache hits (content unchanged since a recent run → replay the
    // stored gigs, no LLM call) and misses (need extraction). The hash is over the
    // exact content string that would be sent to the model, so a hit guarantees an
    // identical prompt. Cached gigs are re-filtered against the (daily-shifting) date
    // window since the cache is date-agnostic.
    const cacheHitGigs: Gig[] = [];
    const missPages: ScrapedContent[] = [];
    for (const sc of successfulPages) {
      const { content } = preparePageContent(sc);
      const cached = this.cache.get(sc.url, PageExtractionCache.hash(content));
      if (cached) {
        const inWindow = cached.filter((g) => isWithinRange(g.date, dateRange));
        cacheHitGigs.push(...inWindow);
        logger.debug(
          { url: sc.url, cache: "HIT", gigs: inWindow.length },
          "Extraction cache hit - skipping Gemini call for this page"
        );
      } else {
        missPages.push(sc);
        logger.debug(
          { url: sc.url, cache: "MISS" },
          "Extraction cache miss - will call Gemini for this page"
        );
      }
    }

    const cacheHits = successfulPages.length - missPages.length;
    this.runPagesFromCache += cacheHits;
    this.runPagesToGemini += missPages.length;
    logger.info(
      {
        totalPages: successfulPages.length,
        cacheHits,
        cacheMisses: missPages.length,
        hitRate: `${Math.round((cacheHits / successfulPages.length) * 100)}%`,
        cachedGigs: cacheHitGigs.length,
      },
      `Extraction cache: ${cacheHits}/${successfulPages.length} pages hit, ${missPages.length} need Gemini`
    );

    if (missPages.length === 0) {
      logger.info({ totalGigs: cacheHitGigs.length }, "All pages served from extraction cache");
      return cacheHitGigs;
    }

    // Chunk the misses into smaller batches to keep each prompt a reasonable size
    const CHUNK_SIZE = env.GEMINI_CHUNK_SIZE;
    const chunks: ScrapedContent[][] = [];
    for (let i = 0; i < missPages.length; i += CHUNK_SIZE) {
      chunks.push(missPages.slice(i, i + CHUNK_SIZE));
    }

    logger.info(
      { missPages: missPages.length, chunks: chunks.length, chunkSize: CHUNK_SIZE },
      "Split cache-miss pages into chunks (extracting in parallel)"
    );

    // Extract all chunks in parallel. The per-call retry/backoff handles transient
    // 429s and the key has ample RPM headroom, so we don't serialize with delays.
    // A failed chunk contributes no gigs but never aborts the others.
    const chunkResults = await Promise.all(
      chunks.map(async (chunk, i) => {
        try {
          const groups = await this.extractGigsFromChunk(chunk, dateRange);
          const gigCount = groups.reduce((n, g) => n + g.gigs.length, 0);
          logger.info(
            { chunkIndex: i + 1, totalChunks: chunks.length, gigsExtracted: gigCount },
            "Chunk processed successfully"
          );
          return groups;
        } catch (error) {
          logger.error({ chunkIndex: i + 1, error }, "Chunk processing failed");
          return [] as Array<{ url: string | null; gigs: Gig[] }>;
        }
      })
    );

    // Persist each attributed page's result (empty included - "no gigs" is worth
    // caching). Unattributed groups (url === null, e.g. a malformed response) are
    // returned but never cached, so a bad parse can't poison future runs.
    const freshGigs: Gig[] = [];
    for (const group of chunkResults.flat()) {
      freshGigs.push(...group.gigs);
      if (group.url !== null) {
        const source = missPages.find((p) => p.url === group.url);
        if (source) {
          const { content } = preparePageContent(source);
          this.cache.set(group.url, PageExtractionCache.hash(content), group.gigs);
        }
      }
    }
    // Note: no flush here - the cache is persisted once per run via flushCache(),
    // avoiding redundant/racy writes while sources extract concurrently.

    const allGigs = [...cacheHitGigs, ...freshGigs];
    logger.info(
      { totalGigs: allGigs.length, cached: cacheHitGigs.length, fresh: freshGigs.length },
      "All chunks processed"
    );

    return allGigs;
  }

  /**
   * Extract gigs for one chunk of pages, returning the gigs grouped by their source
   * page so the caller can cache each page's result independently. Every input page
   * gets exactly one group (url set, `gigs` possibly empty). On a malformed response
   * that can't be attributed to pages, a single fallback group with `url: null` is
   * returned - its gigs are still used but never cached.
   */
  private async extractGigsFromChunk(
    pages: ScrapedContent[],
    dateRange?: { startDate: string; endDate: string }
  ): Promise<Array<{ url: string | null; gigs: Gig[] }>> {
    return retry(
      async () => {
        const pagesData = pages.map((sc) => preparePageContent(sc));

        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const prompt = GIG_EXTRACTION_BATCH_PROMPT(pagesData, dateRange);
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        try {
          const data = JSON.parse(responseText);

          // Preferred shape: results grouped by page number (1-based, matching the
          // order pages were sent). Map each back to its source page URL.
          if (Array.isArray(data.results)) {
            const groups: Array<{ url: string | null; gigs: Gig[] }> = pages.map((sc) => ({
              url: sc.url,
              gigs: [] as Gig[],
            }));
            for (const entry of data.results) {
              const idx = Number(entry?.page) - 1;
              if (!Number.isInteger(idx) || idx < 0 || idx >= pages.length) {
                logger.warn({ page: entry?.page }, "Response referenced an unknown page number");
                continue;
              }
              groups[idx].gigs.push(...buildGigsFromData(entry.gigs, dateRange));
            }
            return groups;
          }

          // Fallback: flat {gigs:[...]} (older shape). Can't attribute to pages, so
          // return one unattributed group - used but not cached.
          if (Array.isArray(data.gigs)) {
            logger.warn("Extraction response used the flat shape; skipping cache for this chunk");
            return [{ url: null, gigs: buildGigsFromData(data.gigs, dateRange) }];
          }

          logger.error({ text: responseText }, "Extraction response missing results/gigs");
          return [];
        } catch (error) {
          logger.error({ error, text: responseText }, "Failed to parse Gemini batch response");
          return [];
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn(
            { error, attempt },
            `Gemini chunk extraction attempt failed: ${geminiErrorSummary(error)}`
          );
        },
      }
    );
  }

  async filterEventDetailUrls(
    links: string[],
    pageContext: { url: string; title?: string }
  ): Promise<string[]> {
    return retry(
      async () => {
        logger.info(
          { linkCount: links.length, sourceUrl: pageContext.url },
          "Filtering links to event detail URLs with Gemini"
        );

        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const prompt = EVENT_LINK_FILTER_PROMPT(links, pageContext);
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
          const data = JSON.parse(text);
          const eventUrls = data.event_detail_urls || [];
          logger.info({ count: eventUrls.length }, "Filtered to event detail URLs");
          return eventUrls;
        } catch (error) {
          logger.error({ error, text }, "Failed to parse Gemini link filter response");
          return [];
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn(
            { error, attempt },
            `Gemini link filter attempt failed: ${geminiErrorSummary(error)}`
          );
        },
      }
    );
  }
}
