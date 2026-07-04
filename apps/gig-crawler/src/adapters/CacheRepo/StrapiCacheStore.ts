import axios, { type AxiosInstance, AxiosError } from "axios";
import type { CacheRecord, PageCacheStore } from "./types.js";
import { env } from "../../models/env.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";

/**
 * Persists the extraction cache as a single JSON blob in Strapi's `crawl-cache`
 * single-type (backed by the same Postgres the CMS uses). The crawler reaches it
 * over the REST API with the token it already holds — no DB driver, no volume, no
 * extra credentials. The whole record is one `data` JSON field: one GET to load,
 * one PUT to save per run (the cache is small and the crawler is single-instance).
 */
export class StrapiCacheStore implements PageCacheStore {
  private readonly client: AxiosInstance;

  constructor(apiUrl: string = env.STRAPI_API_URL, apiToken: string = env.STRAPI_API_TOKEN) {
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  async load(): Promise<CacheRecord> {
    return retry(
      async () => {
        try {
          const res = await this.client.get("/api/crawl-cache");
          const data = res.data?.data?.data;
          return data && typeof data === "object" ? (data as CacheRecord) : {};
        } catch (error) {
          // The single-type has no entry until the crawler writes it the first time;
          // Strapi answers GET with 404 in that state. Treat as an empty cache.
          if (error instanceof AxiosError && error.response?.status === 404) {
            return {};
          }
          throw error;
        }
      },
      { maxAttempts: 3 }
    );
  }

  async save(record: CacheRecord): Promise<void> {
    await retry(() => this.client.put("/api/crawl-cache", { data: { data: record } }), {
      maxAttempts: 3,
      onError: (error, attempt) => {
        logger.warn({ attempt, error }, "Failed to save crawl cache to Strapi, retrying");
      },
    });
  }
}
