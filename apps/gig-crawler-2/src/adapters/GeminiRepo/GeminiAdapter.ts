import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMPort } from "../../ports/LLMPort.js";
import type { SearchResult } from "../../models/searchResult.js";
import type { ScrapedContent } from "../../models/scrapedContent.js";
import type { Gig } from "../../models/gig.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { parseFlexibleDate } from "../../utils/dateUtils.js";
import { URL_FILTER_PROMPT } from "../../prompts/urlFilter.js";
import { GIG_EXTRACTION_PROMPT } from "../../prompts/gigExtraction.js";
import { GIG_EXTRACTION_BATCH_PROMPT } from "../../prompts/gigExtractionBatch.js";
import { env } from "../../models/env.js";

export class GeminiAdapter implements LLMPort {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;

  constructor(apiKey: string = env.GEMINI_API_KEY, model: string = env.GEMINI_MODEL) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async filterPromisingUrls(
    searchResults: SearchResult[]
  ): Promise<string[]> {
    return retry(
      async () => {
        logger.info(
          { count: searchResults.length },
          "Filtering search results with Gemini"
        );

        const resultsText = searchResults
          .map(
            (r) =>
              `URL: ${r.url}\nTitle: ${r.title}\nDescription: ${r.description || "N/A"}`
          )
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

  async extractGigsFromContent(
    scrapedContent: ScrapedContent
  ): Promise<Gig[]> {
    if (!scrapedContent.success || !scrapedContent.text) {
      logger.warn(
        { url: scrapedContent.url },
        "Skipping extraction (no text)"
      );
      return [];
    }

    return retry(
      async () => {
        logger.info({ url: scrapedContent.url }, "Extracting gigs with Gemini");

        // Truncate text if too long
        const text = scrapedContent.text!.slice(0, 50000);

        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const prompt = GIG_EXTRACTION_PROMPT(scrapedContent.url, text);
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
                logger.warn(
                  { gig: gigData },
                  "Skipping gig with invalid date"
                );
                continue;
              }

              gigs.push({
                title: gigData.title,
                date,
                venueName: gigData.venue_name || "Unknown Venue",
                description: gigData.description,
                price: gigData.price,
                url: scrapedContent.url,
                imageUrl: gigData.image_url,
              });
            } catch (error) {
              logger.warn({ error, gigData }, "Failed to parse gig");
            }
          }

          logger.info(
            { count: gigs.length, url: scrapedContent.url },
            "Extracted gigs"
          );
          return gigs;
        } catch (error) {
          logger.error(
            { error, text: responseText },
            "Failed to parse Gemini response"
          );
          return [];
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt }, "Gemini extraction attempt failed");
        },
      }
    );
  }

  async extractGigsFromMultiplePages(
    scrapedContents: ScrapedContent[]
  ): Promise<Gig[]> {
    const successfulPages = scrapedContents.filter(
      (sc) => sc.success && sc.text
    );

    if (successfulPages.length === 0) {
      logger.warn("No successful pages to extract from");
      return [];
    }

    return retry(
      async () => {
        logger.info(
          { pageCount: successfulPages.length },
          "Extracting gigs from multiple pages with Gemini (batch)"
        );

        // Prepare pages data
        const pages = successfulPages.map((sc) => ({
          url: sc.url,
          content: sc.text!.slice(0, 15000), // Limit per page
        }));

        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const prompt = GIG_EXTRACTION_BATCH_PROMPT(pages);
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
                logger.warn(
                  { gig: gigData },
                  "Skipping gig with invalid date"
                );
                continue;
              }

              gigs.push({
                title: gigData.title,
                date,
                venueName: gigData.venue_name || "Unknown Venue",
                description: gigData.description,
                price: gigData.price,
                url: gigData.url || "", // LLM should provide source page URL
                imageUrl: gigData.image_url,
              });
            } catch (error) {
              logger.warn({ error, gigData }, "Failed to parse gig");
            }
          }

          logger.info(
            { count: gigs.length, pageCount: successfulPages.length },
            "Extracted gigs from all pages"
          );
          return gigs;
        } catch (error) {
          logger.error(
            { error, text: responseText },
            "Failed to parse Gemini batch response"
          );
          return [];
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt }, "Gemini batch extraction attempt failed");
        },
      }
    );
  }
}
