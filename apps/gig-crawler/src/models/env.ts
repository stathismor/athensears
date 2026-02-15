import { z } from "zod";

export const EnvSchema = z.object({
  // Strapi CMS
  STRAPI_API_URL: z.string().default("http://localhost:1337"),
  STRAPI_API_TOKEN: z.string(),

  // Brave Web Search API
  BRAVE_API_KEY: z.string(),

  // Google Gemini API
  GEMINI_API_KEY: z.string(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash-latest"),

  // Server
  PORT: z.string().default("3000"),
  NODE_ENV: z.string().default("development"),

  // Cron
  CRON_SCHEDULE: z.string().default("0 2 * * *"),
  TZ: z.string().default("Europe/Athens"),

  // Scraper
  SCRAPER_CONCURRENCY: z.string().default("5"),

  // Auth
  SYNC_API_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);
