import { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { SyncResult, StrapiEntity } from '../types/index.js';
import { Gig } from '../models/gig.js';
import { StrapiGig } from '../models/strapiGig.js';
import { StrapiVenue } from '../models/strapiVenue.js';
import * as strapiService from './strapiService.js';

interface SyncDependencies {
  searchAndExtractGigs: () => Promise<Gig[]>;
  strapiClient: AxiosInstance;
}

/**
 * Run the complete sync workflow
 * Orchestrates search, extraction, venue matching, and gig creation
 */
export async function sync(deps: SyncDependencies): Promise<SyncResult> {
  const startTime = Date.now();

  try {
    logger.info('Starting sync workflow...');

    const result: SyncResult = {
      status: 'in_progress',
      summary: {
        gigsFound: 0,
        gigsCreated: 0,
        gigsDuplicate: 0,
        gigsSkipped: 0,
        venuesCreated: 0,
        errors: [],
      },
    };

    // Venue cache for this sync run
    const venueCache = new Map<string, number>();

    // Step 1: Search and extract gig data using Brave AI
    logger.info('Step 1: Searching and extracting gig data with Brave AI...');
    const extractedGigs = await deps.searchAndExtractGigs();
    result.summary.gigsFound = extractedGigs.length;

    if (extractedGigs.length === 0) {
      logger.warn('No gigs found by Brave AI');
      result.status = 'completed';
      result.executionTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      return result;
    }

    // Step 2: Process venues and create gigs
    logger.info('Step 2: Processing venues and creating gigs...');
    for (const extractedGig of extractedGigs) {
      try {
        await processGig(extractedGig, result, venueCache, deps.strapiClient);
      } catch (error) {
        const errorMsg = `Failed to process gig "${extractedGig.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ error, gig: extractedGig }, errorMsg);
        result.summary.errors.push(errorMsg);
        result.summary.gigsSkipped++;
      }
    }

    result.status = 'completed';
    result.executionTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

    logger.info({ result }, 'Sync completed successfully');
    return result;
  } catch (error) {
    logger.error({ error }, 'Sync failed');
    throw error;
  }
}

/**
 * Process a single extracted gig: match/create venue, check for duplicates, create gig
 */
async function processGig(
  extractedGig: Gig,
  result: SyncResult,
  venueCache: Map<string, number>,
  strapiClient: AxiosInstance
): Promise<void> {
  // Step 1: Get or create venue
  const venueId = await getOrCreateVenue(extractedGig.venue, result, venueCache, strapiClient);

  // Step 2: Check if gig already exists (deduplication)
  const exists = await strapiService.gigExists(strapiClient, extractedGig.title, extractedGig.date);
  if (exists) {
    logger.info({ title: extractedGig.title, date: extractedGig.date }, 'Gig already exists, skipping');
    result.summary.gigsDuplicate++;
    return;
  }

  // Step 3: Create the gig
  const gig: StrapiGig = {
    title: extractedGig.title,
    date: extractedGig.date,
    time_display: extractedGig.time_display,
    price: extractedGig.price,
    description: extractedGig.description,
    venue: venueId,
  };

  await strapiService.createGig(strapiClient, gig);
  result.summary.gigsCreated++;
}

/**
 * Get existing venue by name or create a new one
 * Uses cache to avoid duplicate API calls during a single sync run
 */
async function getOrCreateVenue(
  venueData: { name: string; address?: string; website?: string; neighborhood?: string },
  result: SyncResult,
  venueCache: Map<string, number>,
  strapiClient: AxiosInstance
): Promise<number> {
  const venueName = venueData.name;

  // Check cache first
  if (venueCache.has(venueName.toLowerCase())) {
    const cachedId = venueCache.get(venueName.toLowerCase())!;
    logger.debug({ venueName, venueId: cachedId }, 'Using cached venue');
    return cachedId;
  }

  // Search for existing venue in Strapi
  const existingVenue = await strapiService.getVenueByName(strapiClient, venueName);

  if (existingVenue) {
    // Venue exists, cache and return ID
    venueCache.set(venueName.toLowerCase(), existingVenue.id);
    logger.info({ venueName, venueId: existingVenue.id }, 'Found existing venue');
    return existingVenue.id;
  }

  // Venue doesn't exist, create it
  logger.info({ venueName }, 'Creating new venue');
  const newVenue: StrapiVenue = {
    name: venueData.name,
    address: venueData.address,
    website: venueData.website,
    neighborhood: venueData.neighborhood,
  };

  const createdVenue = await strapiService.createVenue(strapiClient, newVenue);
  venueCache.set(venueName.toLowerCase(), createdVenue.id);
  result.summary.venuesCreated++;

  return createdVenue.id;
}
