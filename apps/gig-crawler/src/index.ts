import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { searchAndExtractGigs } from './services/searchService.js';
import { createStrapiClient } from './services/strapiService.js';
import { sync } from './services/syncService.js';

// Create Strapi client
const strapiClient = createStrapiClient(config.strapi.apiUrl, config.strapi.apiToken);

logger.info('Services initialized successfully');

// Express app
const app = express();

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'gig-crawler',
    timestamp: new Date().toISOString(),
  });
});

// Manual sync endpoint
app.post('/api/sync', async (req, res) => {
  try {
    logger.info('Manual sync triggered via API');

    // Start sync in background and return immediately
    const syncPromise = sync({
      searchAndExtractGigs: () => searchAndExtractGigs(config.search.braveApiKey),
      strapiClient,
    });

    res.json({
      status: 'in_progress',
      message: 'Sync started successfully',
    });

    // Wait for sync to complete and log results
    const result = await syncPromise;
    logger.info({ result }, 'Manual sync completed');
  } catch (error) {
    logger.error({ error }, 'Manual sync failed');

    // Response might have already been sent, so check first
    if (!res.headersSent) {
      res.status(500).json({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});

// Setup cron job for nightly sync
if (config.cron.schedule) {
  logger.info(
    { schedule: config.cron.schedule, timezone: config.cron.timezone },
    'Setting up cron job for automated sync'
  );

  cron.schedule(
    config.cron.schedule,
    async () => {
      try {
        logger.info('Cron job triggered: starting automated sync');
        const result = await sync({
          searchAndExtractGigs: () => searchAndExtractGigs(config.search.braveApiKey),
          strapiClient,
        });
        logger.info({ result }, 'Automated sync completed successfully');
      } catch (error) {
        logger.error({ error }, 'Automated sync failed');
      }
    },
    {
      timezone: config.cron.timezone,
    }
  );

  logger.info('Cron job configured successfully');
}

// Start server
const server = app.listen(config.server.port, () => {
  logger.info(
    {
      port: config.server.port,
      env: config.server.nodeEnv,
      cronSchedule: config.cron.schedule,
    },
    'Gig crawler service started'
  );
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutdown signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
