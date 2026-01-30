import { z } from 'zod';

/**
 * Environment configuration schema
 */
export const envSchema = z.object({
  STRAPI_API_URL: z.string().url().min(1, 'STRAPI_API_URL is required'),
  STRAPI_API_TOKEN: z.string().min(1, 'STRAPI_API_TOKEN is required'),
  BRAVE_API_KEY: z.string().min(1, 'BRAVE_API_KEY is required'),
  PORT: z.string().optional().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  CRON_SCHEDULE: z.string().optional().default('0 2 * * *'),
  TZ: z.string().optional().default('Europe/Athens'),
  LOG_LEVEL: z.string().optional().default('info'),
});

export type Env = z.infer<typeof envSchema>;
