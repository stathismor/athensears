import express from "express";
import cron from "node-cron";
import { env } from "./models/env.js";
import { logger } from "./utils/logger.js";
import { BraveSearchAdapter } from "./adapters/BraveSearchRepo/BraveSearchAdapter.js";
import { PlaywrightAdapter } from "./adapters/ContentScraperRepo/PlaywrightAdapter.js";
import { GeminiAdapter } from "./adapters/GeminiRepo/GeminiAdapter.js";
import { StrapiAdapter } from "./adapters/StrapiRepo/StrapiAdapter.js";
import { SyncGigsCommand } from "./commands/SyncGigsCommand.js";

const app = express();
const port = parseInt(env.PORT, 10);

// Initialize adapters
const searchAdapter = new BraveSearchAdapter();
const scraperAdapter = new PlaywrightAdapter();
const llmAdapter = new GeminiAdapter();
const gigsAdapter = new StrapiAdapter();

// Track sync status
let isSyncRunning = false;

// Sync function
async function syncGigs(options: { clearExisting?: boolean } = {}) {
  if (isSyncRunning) {
    logger.warn("Sync already in progress, skipping");
    return;
  }

  isSyncRunning = true;
  try {
    logger.info({ options }, "Starting gig sync");

    const command = new SyncGigsCommand(
      searchAdapter,
      scraperAdapter,
      llmAdapter,
      gigsAdapter
    );

    const stats = await command.execute(options);
    logger.info({ stats }, "Sync completed successfully");
  } catch (error) {
    logger.error({ error }, "Sync failed");
  } finally {
    isSyncRunning = false;
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "gig-crawler",
    version: "1.0.0",
    environment: env.NODE_ENV,
  });
});

// Manual sync endpoint (non-blocking)
app.post("/api/sync", (req, res) => {
  if (env.SYNC_API_KEY) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${env.SYNC_API_KEY}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Default to clearing existing data (use ?clear=false to keep old data)
  const clearExisting = req.query.clear !== "false";

  if (isSyncRunning) {
    return res.status(409).json({
      status: "already_running",
      message: "A sync is already in progress",
    });
  }

  logger.info({ clearExisting }, "Manual sync triggered via API");

  // Start sync in background (don't await)
  syncGigs({ clearExisting }).catch((error) => {
    logger.error({ error }, "Background sync failed");
  });

  // Return immediately
  res.json({
    status: "started",
    message: clearExisting
      ? "Sync started (clearing existing gigs first)"
      : "Sync started in background (keeping existing data)",
  });
});

// Sync status endpoint
app.get("/api/sync/status", (req, res) => {
  res.json({
    status: isSyncRunning ? "running" : "idle",
    isRunning: isSyncRunning,
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "gig-crawler",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      sync: "/api/sync (POST) - Start background sync",
      syncStatus: "/api/sync/status (GET) - Check sync status",
    },
  });
});

// Schedule cron job
logger.info(
  { schedule: env.CRON_SCHEDULE, timezone: env.TZ },
  "Scheduling cron job"
);

cron.schedule(
  env.CRON_SCHEDULE,
  () => {
    syncGigs();
  },
  {
    timezone: env.TZ,
  }
);

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, "Received signal, shutting down");
    await scraperAdapter.close();
    process.exit(0);
  });
}

// Start server
app.listen(port, () => {
  logger.info(
    {
      port,
      environment: env.NODE_ENV,
      strapiUrl: env.STRAPI_API_URL,
      geminiModel: env.GEMINI_MODEL,
    },
    "gig-crawler service started"
  );
});
