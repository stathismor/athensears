import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMPort } from "../../ports/LLMPort.js";
import type { SearchResult } from "../../models/searchResult.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import type { Gig } from "../../models/gig.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { parseFlexibleDate } from "../../utils/dateUtils.js";
import { URL_FILTER_PROMPT } from "../../prompts/urlFilter.js";
import { GIG_EXTRACTION_BATCH_PROMPT } from "../../prompts/gigExtractionBatch.js";
import { EVENT_LINK_FILTER_PROMPT } from "../../prompts/eventLinkFilter.js";
import { env } from "../../models/env.js";

function normalizePrice(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "€" || trimmed === "EUR") {
    return undefined;
  }
  if (/sold\s*out/i.test(trimmed)) {
    return "Sold Out";
  }
  if (/free/i.test(trimmed)) {
    return "Free";
  }

  // Extract all numeric values (handles €16, 18€, 29,50, 27.50, €20-€30, etc.)
  const numbers: number[] = [];
  const regex = /(\d+)[.,](\d+)|\d+/g;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    if (match[1] !== undefined) {
      // Has decimal part (e.g. 27.50 or 29,50)
      numbers.push(parseFloat(`${match[1]}.${match[2]}`));
    } else {
      numbers.push(parseInt(match[0], 10));
    }
  }

  if (numbers.length === 0) {
    return undefined;
  }

  const min = Math.min(...numbers);
  const amount = Math.floor(min);
  if (amount <= 0) {
    return undefined;
  }

  return `€${amount}`;
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

export class GeminiAdapter implements LLMPort {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;

  constructor(apiKey: string = env.GEMINI_API_KEY, model: string = env.GEMINI_MODEL) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async filterPromisingUrls(searchResults: SearchResult[]): Promise<string[]> {
    return retry(
      async () => {
        logger.info({ count: searchResults.length }, "Filtering search results with Gemini");

        const resultsText = searchResults
          .map((r) => `URL: ${r.url}\nTitle: ${r.title}\nDescription: ${r.description || "N/A"}`)
          .join("\n\n");

        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const prompt = URL_FILTER_PROMPT(resultsText);
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        try {
          const data = JSON.parse(text);
          const urls = data.promising_urls || [];
          logger.info({ count: urls.length }, "Filtered to promising URLs");
          return urls;
        } catch (error) {
          logger.error({ error, text }, "Failed to parse Gemini response");
          return [];
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt }, "Gemini filter attempt failed");
        },
      }
    );
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

    logger.info({ totalPages: successfulPages.length }, "Starting batch extraction with chunking");

    // Chunk pages into smaller batches to avoid overwhelming the API
    const CHUNK_SIZE = env.GEMINI_CHUNK_SIZE;
    const DELAY_BETWEEN_CHUNKS_MS =
      env.GEMINI_RATE_LIMIT_RPM > 0 ? Math.ceil(60000 / env.GEMINI_RATE_LIMIT_RPM) : 0;
    const chunks: ScrapedContent[][] = [];
    for (let i = 0; i < successfulPages.length; i += CHUNK_SIZE) {
      chunks.push(successfulPages.slice(i, i + CHUNK_SIZE));
    }

    logger.info(
      { totalPages: successfulPages.length, chunks: chunks.length, chunkSize: CHUNK_SIZE },
      "Split into chunks"
    );

    // Process each chunk with delay between chunks
    const allGigs: Gig[] = [];
    let failedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      logger.info(
        { chunkIndex: i + 1, totalChunks: chunks.length, pagesInChunk: chunk.length },
        "Processing chunk"
      );

      try {
        const gigsFromChunk = await this.extractGigsFromChunk(chunk, dateRange);
        allGigs.push(...gigsFromChunk);

        logger.info(
          { chunkIndex: i + 1, gigsExtracted: gigsFromChunk.length, totalSoFar: allGigs.length },
          "Chunk processed successfully"
        );
      } catch (error) {
        failedChunks++;
        logger.error(
          { chunkIndex: i + 1, error, failedChunks },
          "Chunk processing failed, continuing with next chunk"
        );
      }

      // Add delay between chunks to avoid rate limiting (except after last chunk)
      if (i < chunks.length - 1) {
        logger.info(
          { delayMs: DELAY_BETWEEN_CHUNKS_MS },
          "Waiting before next chunk to avoid rate limits"
        );
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
      }
    }

    if (failedChunks > 0) {
      logger.warn(
        { failedChunks, totalChunks: chunks.length, successfulGigs: allGigs.length },
        "Some chunks failed but continuing with extracted gigs"
      );
    }

    logger.info(
      { totalGigs: allGigs.length, totalPages: successfulPages.length },
      "All chunks processed"
    );

    return allGigs;
  }

  private async extractGigsFromChunk(
    pages: ScrapedContent[],
    dateRange?: { startDate: string; endDate: string }
  ): Promise<Gig[]> {
    return retry(
      async () => {
        // Prepare pages data - use rawHtml if text is too short (Readability failed)
        const MIN_TEXT_LENGTH = 1000;
        const pagesData = pages.map((sc) => {
          const text = sc.text || "";
          const useRawHtml = text.length < MIN_TEXT_LENGTH && sc.rawHtml;

          if (useRawHtml) {
            logger.info(
              { url: sc.url, textLength: text.length },
              "Text too short, using raw HTML instead"
            );
            // Strip HTML tags but keep content for better extraction
            const htmlContent = sc
              .rawHtml!.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
              .replace(/<[^>]+>/g, " ") // Remove HTML tags
              .replace(/\s+/g, " ") // Normalize whitespace
              .trim();

            return {
              url: sc.url,
              content: htmlContent.slice(0, 5000), // Reduced from 8000
            };
          }

          return {
            url: sc.url,
            content: text.slice(0, 5000), // Reduced from 8000
          };
        });

        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const prompt = GIG_EXTRACTION_BATCH_PROMPT(pagesData, dateRange);
        const result = await model.generateContent(prompt);
        const response = result.response;
        const responseText = response.text();

        try {
          const data = JSON.parse(responseText);
          const gigsData = data.gigs || [];

          const gigs: Gig[] = [];
          for (const gigData of gigsData) {
            try {
              const date = parseFlexibleDate(gigData.date);
              if (!date) {
                logger.warn({ gig: gigData }, "Skipping gig with invalid date");
                continue;
              }

              // Filter out gigs outside the date range
              if (dateRange) {
                const gigDate = date.toISOString().slice(0, 10);
                if (gigDate < dateRange.startDate || gigDate > dateRange.endDate) {
                  logger.debug(
                    { title: gigData.title, date: gigDate },
                    "Skipping gig outside date range"
                  );
                  continue;
                }
              }

              gigs.push({
                title: gigData.title,
                date,
                venueName: gigData.venue_name || "Unknown Venue",
                description: gigData.description,
                price: normalizePrice(gigData.price),
                url: normalizeUrl(gigData.url) || normalizeUrl(gigData.ticket_url) || "",
                imageUrl: gigData.image_url,
              });
            } catch (error) {
              logger.warn({ error, gigData }, "Failed to parse gig");
            }
          }

          return gigs;
        } catch (error) {
          logger.error({ error, text: responseText }, "Failed to parse Gemini batch response");
          return [];
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt }, "Gemini chunk extraction attempt failed");
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
          logger.warn({ error, attempt }, "Gemini link filter attempt failed");
        },
      }
    );
  }
}
