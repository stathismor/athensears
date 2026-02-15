import axios from "axios";
import type { SearchPort, SearchOptions } from "../../ports/SearchPort.js";
import type { SearchResult } from "../../models/searchResult.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { env } from "../../models/env.js";

export class BraveSearchAdapter implements SearchPort {
  private readonly baseUrl = "https://api.search.brave.com/res/v1/web/search";
  private readonly apiKey: string;

  constructor(apiKey: string = env.BRAVE_API_KEY) {
    this.apiKey = apiKey;
  }

  async search(query: string, count: number = 20, options: SearchOptions = {}): Promise<SearchResult[]> {
    return retry(
      async () => {
        logger.info({ query, count }, "Searching Brave");

        const params: Record<string, string | number | boolean> = {
          q: query,
          count: Math.min(count, 20),
        };
        if (options.country) params.country = options.country;
        if (options.searchLang) params.search_lang = options.searchLang;
        if (options.extraSnippets) params.extra_snippets = true;

        const response = await axios.get(this.baseUrl, {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": this.apiKey,
          },
          params,
        });

        const results: SearchResult[] = [];
        const webResults = response.data.web?.results || [];

        for (const result of webResults) {
          results.push({
            url: result.url,
            title: result.title,
            description: result.description,
          });
        }

        logger.info({ count: results.length }, "Found search results");
        return results;
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt }, "Brave search attempt failed");
        },
      }
    );
  }
}
