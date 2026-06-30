import { z } from "zod";

export const EnvSchema = z.object({
  // Strapi CMS
  STRAPI_API_URL: z.string().default("http://localhost:1337"),
  STRAPI_API_TOKEN: z.string(),

  // Brave Web Search API (no longer used — discovery now driven by the curated
  // source registry in models/sources.ts; kept optional for backwards compat)
  BRAVE_API_KEY: z.string().optional(),

  // Google Gemini API
  GEMINI_API_KEY: z.string(),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),

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
  // lower GEMINI_RATE_LIMIT_RPM (~10) — the 429 backoff handles overruns either way.
  GEMINI_RATE_LIMIT_RPM: z.coerce.number().default(120),
  GEMINI_CHUNK_SIZE: z.coerce.number().default(6),

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

  // Prune auto gigs not seen (updated) by a crawl in this many days. Acts as a
  // debounce: a gig must be missed by this many consecutive runs before removal,
  // so a single flaky scrape can't delete a still-valid gig. Set 0 to disable.
  SYNC_PRUNE_GRACE_DAYS: z.coerce.number().default(3),

  // Logging
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);
