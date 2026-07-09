import express from "express";
import { env } from "./models/env.js";
import { logger } from "./utils/logger.js";
import { PlaywrightAdapter } from "./adapters/ContentScraperRepo/PlaywrightAdapter.js";
import { GeminiAdapter } from "./adapters/GeminiRepo/GeminiAdapter.js";
import { StrapiAdapter } from "./adapters/StrapiRepo/StrapiAdapter.js";
import { SyncGigsCommand, type SyncOptions } from "./commands/SyncGigsCommand.js";
import { NormalizeGigsCommand } from "./commands/NormalizeGigsCommand.js";

const app = express();
app.use(express.json());
const port = parseInt(env.PORT, 10);

/**
 * Normalize source identifiers from the request into registry ids. Accepts a
 * comma-separated string ("more.com,fuzz-club") or an array, and maps the natural
 * domain spelling to the dash form used by source ids ("more.com" -> "more-com").
 */
function normalizeSources(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const ids = raw
    .map((s) =>
      String(s)
        .trim()
        .toLowerCase()
        .replace(/[.\s]+/g, "-")
    )
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

// Initialize adapters
const scraperAdapter = new PlaywrightAdapter();
const llmAdapter = new GeminiAdapter();
const gigsAdapter = new StrapiAdapter();

// Track sync status
let isSyncRunning = false;

// Sync function
async function syncGigs(options: SyncOptions = {}) {
  if (isSyncRunning) {
    logger.warn("Sync already in progress, skipping");
    return;
  }

  isSyncRunning = true;
  try {
    // Start/complete + full stats are logged inside command.execute(); don't repeat here.
    const command = new SyncGigsCommand(scraperAdapter, llmAdapter, gigsAdapter);
    await command.execute(options);
  } catch (error) {
    logger.error({ error }, "Sync failed");
  } finally {
    isSyncRunning = false;
  }
}

// Normalize/backfill: re-clean stored gig titles/venues in place (no scrape, no LLM).
// Runs in the background like syncGigs; the full report is logged inside execute().
async function normalizeGigs(options: { includeManual?: boolean } = {}) {
  if (isSyncRunning) {
    logger.warn("Sync already in progress, skipping normalize");
    return;
  }

  isSyncRunning = true;
  try {
    await new NormalizeGigsCommand(gigsAdapter).execute(options);
  } catch (error) {
    logger.error({ error }, "Normalize failed");
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

// Manual sync endpoint (non-blocking). The default scrapes; normalize=true instead runs
// the in-place title/venue backfill. Both run in the background, return immediately, and
// share the isSyncRunning guard so they never overlap.
app.post("/api/sync", (req, res) => {
  if (env.SYNC_API_KEY) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${env.SYNC_API_KEY}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Options come from the JSON request body.
  const p: Record<string, unknown> = (req.body ?? {}) as Record<string, unknown>;
  const truthy = (v: unknown) => v === true || v === "true" || v === "1";
  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") {
      return undefined;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  if (isSyncRunning) {
    return res.status(409).json({
      status: "already_running",
      message: "A sync is already in progress",
    });
  }

  // Normalize/backfill mode: re-clean stored gig titles/venues in place - no scrape, no
  // LLM. includeManual:true also re-cleans hand-edited gigs. The report is logged.
  if (truthy(p.normalize)) {
    const includeManual = truthy(p.includeManual);
    normalizeGigs({ includeManual }).catch((error) => {
      logger.error({ error }, "Background normalize failed");
    });
    return res.json({ status: "started", message: "Normalize started in background" });
  }

  // Non-destructive by default: upsert into existing gigs. clear=true wipes non-manual
  // gigs first (rarely needed; a normal run already refreshes).
  const clearExisting = truthy(p.clear);
  // Cache on by default; cache=false or force=true bypasses it (full re-extraction).
  const useCache = !(p.cache === false || p.cache === "false" || truthy(p.force));
  const monthsAhead = num(p.monthsAhead);
  // Small-scale test knob: cap how many sources are crawled.
  const maxSources = num(p.maxSources);
  // Test a specific source (or a few): {"sources":["more.com"]} or {"sources":"more.com,fuzz-club"}.
  // Pick a deterministic source like more.com to test without spending on the LLM.
  const sources = normalizeSources(p.sources);

  const options: SyncOptions = {
    clearExisting,
    monthsAhead,
    useCache,
    maxSources,
    sources,
  };
  logger.info({ options }, "Manual sync triggered via API");

  // Start sync in background (don't await)
  syncGigs(options).catch((error) => {
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

// Dry-run delete endpoint - shows what would be deleted, then deletes
app.post("/api/gigs/delete", async (req, res) => {
  if (env.SYNC_API_KEY) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${env.SYNC_API_KEY}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Dry-run by default (safe); pass {"dryRun": false} in the body to actually delete.
  const dryRun = !(req.body?.dryRun === false || req.body?.dryRun === "false");

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
      sync: '/api/sync (POST) - Start background sync. JSON body options: clear, monthsAhead, force|cache:false (bypass cache), maxSources, sources (e.g. ["more.com"] - restrict to specific sources). Or normalize:true to re-clean stored gig titles/venues in place instead of scraping (includeManual:true also re-cleans manual gigs)',
      syncStatus: "/api/sync/status (GET) - Check sync status",
    },
  });
});

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
