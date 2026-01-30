import { envSchema } from './models/env.js';

// Validate and parse environment variables
const env = envSchema.parse(process.env);

export const config = {
  strapi: {
    apiUrl: env.STRAPI_API_URL,
    apiToken: env.STRAPI_API_TOKEN,
  },
  search: {
    braveApiKey: env.BRAVE_API_KEY,
  },
  server: {
    port: parseInt(env.PORT, 10),
    nodeEnv: env.NODE_ENV,
  },
  cron: {
    schedule: env.CRON_SCHEDULE,
    timezone: env.TZ,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
};
