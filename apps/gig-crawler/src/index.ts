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
async function syncGigs(options: { clearExisting?: boolean; monthsAhead?: number } = {}) {
  if (isSyncRunning) {
    logger.warn("Sync already in progress, skipping");
    return;
  }

  isSyncRunning = true;
  try {
    logger.info({ options }, "Starting gig sync");

    const command = new SyncGigsCommand(searchAdapter, scraperAdapter, llmAdapter, gigsAdapter);

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
  const monthsAhead = req.query.monthsAhead
    ? parseInt(req.query.monthsAhead as string, 10)
    : undefined;

  if (isSyncRunning) {
    return res.status(409).json({
      status: "already_running",
      message: "A sync is already in progress",
    });
  }

  logger.info({ clearExisting, monthsAhead }, "Manual sync triggered via API");

  // Start sync in background (don't await)
  syncGigs({ clearExisting, monthsAhead }).catch((error) => {
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

// Dry-run delete endpoint — shows what would be deleted, then deletes
app.post("/api/gigs/delete", async (req, res) => {
  if (env.SYNC_API_KEY) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${env.SYNC_API_KEY}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const dryRun = req.query.dryRun !== "false";

  try {
    // Fetch all non-manual gigs (same filter as deleteAllGigsIndividual)
    const strapiUrl = env.STRAPI_API_URL;
    const response = await fetch(
      `${strapiUrl}/api/gigs?pagination[pageSize]=100&filters[manual][$ne]=true`,
      {
        headers: { Authorization: `Bearer ${env.STRAPI_API_TOKEN}` },
      }
    );
    const data = (await response.json()) as any;
    const gigs = Array.isArray(data.data) ? data.data : [];

    // Also fetch manual gigs to show what's protected
    const manualResponse = await fetch(
      `${strapiUrl}/api/gigs?pagination[pageSize]=100&filters[manual][$eq]=true`,
      {
        headers: { Authorization: `Bearer ${env.STRAPI_API_TOKEN}` },
      }
    );
    const manualData = (await manualResponse.json()) as any;
    const manualGigs = Array.isArray(manualData.data) ? manualData.data : [];

    const summary = {
      wouldDelete: gigs.map((g: any) => ({
        id: g.id,
        documentId: g.documentId,
        title: g.title,
        date: g.date,
        manual: g.manual,
      })),
      protected: manualGigs.map((g: any) => ({
        id: g.id,
        documentId: g.documentId,
        title: g.title,
        date: g.date,
        manual: g.manual,
      })),
      counts: { toDelete: gigs.length, protected: manualGigs.length },
      dryRun,
    };

    if (dryRun) {
      return res.json({ status: "dry_run", ...summary });
    }

    // Actually delete
    const deletedCount = await gigsAdapter.deleteAllGigs();
    return res.json({ status: "deleted", deletedCount, ...summary });
  } catch (error: any) {
    logger.error({ error }, "Delete endpoint failed");
    return res.status(500).json({ error: error.message });
  }
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
logger.info({ schedule: env.CRON_SCHEDULE, timezone: env.TZ }, "Scheduling cron job");

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
