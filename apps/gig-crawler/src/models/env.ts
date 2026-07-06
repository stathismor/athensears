import { z } from "zod";

export const EnvSchema = z.object({
  // Strapi CMS
  STRAPI_API_URL: z.string().default("http://localhost:1337"),
  STRAPI_API_TOKEN: z.string(),

  // Google Gemini API.
  // Default is the Flash-Lite tier - ~3x cheaper input tokens than Flash and
  // adequate for this structured extraction task. If you notice the taste filter
  // / genre labelling degrading, override GEMINI_MODEL back to "gemini-flash-latest".
  GEMINI_API_KEY: z.string(),
  GEMINI_MODEL: z.string().default("gemini-flash-lite-latest"),

  // Server
  PORT: z.string().default("3000"),
  NODE_ENV: z.string().default("development"),

  // Cron
  CRON_SCHEDULE: z.string().default("0 2 * * *"),
  TZ: z.string().default("Europe/Athens"),

  // Scraper
  SCRAPER_CONCURRENCY: z.string().default("5"),

  // Gemini rate limiting & chunking. Defaults suit a paid tier (gemini-2.5/flash
  // allow ~1000 RPM); the inter-chunk delay is 60000/RPM ms. On the free tier,
  // lower GEMINI_RATE_LIMIT_RPM (~10) - the 429 backoff handles overruns either way.
  GEMINI_RATE_LIMIT_RPM: z.coerce.number().default(120),
  // Pages per extraction call. Higher = fewer calls (same total tokens); Flash-Lite's
  // context easily fits 10 pages (~50k chars). A failed chunk loses more at once, but
  // retries + per-page result grouping cover that.
  GEMINI_CHUNK_SIZE: z.coerce.number().default(10),

  // Auth
  SYNC_API_KEY: z.string().optional(),

  // Sync
  SYNC_MONTHS_AHEAD: z.coerce.number().default(3),

  // How many registry sources to crawl in parallel (each still scrapes its own
  // pages with SCRAPER_CONCURRENCY). Higher = faster runs, more concurrent browser
  // pages + LLM calls.
  SYNC_SOURCE_CONCURRENCY: z.coerce.number().default(4),

  // Max event-detail pages to scrape per source per run (bounds cost/time).
  SYNC_MAX_DETAIL_PER_SOURCE: z.coerce.number().default(30),

  // Fill in a gig's price from its event detail page when structured extraction found
  // none - site-agnostic (JSON-LD offers, microdata, then price/money elements). Reuses
  // already-scraped page HTML where possible, else does one HTTP fetch per priceless
  // gig; no LLM tokens. Mainly benefits listing-only sources (e.g. more.com) whose
  // listing carries no price. Set false to disable.
  SYNC_ENRICH_PRICES: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),

  // Escalate more.com events tagged only "other" (which the deterministic genre filter
  // skips) to the LLM: scrape their detail pages and batch-extract, recovering curated
  // acts more.com's coarse tagging buries (post-metal, noise, garage, folk...). Bounded
  // by SYNC_MAX_DETAIL_PER_SOURCE and cached like all extraction. Set false to disable.
  SYNC_ESCALATE_OTHER: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),

  // Prune auto gigs not seen (updated) by a crawl in this many days. Acts as a
  // debounce: a gig must be missed by this many consecutive runs before removal,
  // so a single flaky scrape can't delete a still-valid gig. Set 0 to disable.
  SYNC_PRUNE_GRACE_DAYS: z.coerce.number().default(3),

  // Extraction cache. Skips the Gemini extraction call for a scraped page whose
  // content is byte-identical to a recent run (event detail pages rarely change),
  // replaying the cached gigs instead - the dominant cost saver. Persisted in the
  // Strapi `crawl-cache` single-type (Postgres), so no files/volumes are involved;
  // the crawler's Strapi API token needs find+update on it. Entries older than
  // CRAWLER_CACHE_TTL_DAYS are re-extracted regardless of hash, so far-future events
  // entering the date window and any missed edits self-heal. Set false to disable.
  CRAWLER_CACHE_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  CRAWLER_CACHE_TTL_DAYS: z.coerce.number().default(7),

  // Logging
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);
