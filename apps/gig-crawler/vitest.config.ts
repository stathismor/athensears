import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The env schema (src/models/env.ts) is parsed at import time and requires these.
    // Disable the caches/enrichment/escalation so a sync run is fully deterministic and
    // depends only on the injected fakes. NODE_ENV != "development" keeps the logger off
    // the pino-pretty transport (no worker thread during tests); LOG_LEVEL silences it.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      GEMINI_API_KEY: "test-key",
      STRAPI_API_TOKEN: "test-token",
      CRAWLER_CACHE_ENABLED: "false",
      SYNC_ENRICH_PRICES: "false",
      SYNC_ESCALATE_OTHER: "false",
    },
  },
});
