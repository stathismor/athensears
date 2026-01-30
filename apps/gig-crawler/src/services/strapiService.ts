import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { retry } from '../utils/retry.js';
import { StrapiResponse, StrapiEntity } from '../types/index.js';
import { StrapiGig } from '../models/strapiGig.js';
import { StrapiVenue } from '../models/strapiVenue.js';

/**
 * Create an axios client configured for Strapi API
 */
export function createStrapiClient(apiUrl: string, apiToken: string): AxiosInstance {
  return axios.create({
    baseURL: `${apiUrl}/api`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    timeout: 10000,
  });
}

/**
 * Get all venues from Strapi
 */
export async function getVenues(client: AxiosInstance): Promise<StrapiEntity<StrapiVenue>[]> {
  try {
    logger.info('Fetching venues from Strapi...');
    const response = await client.get<StrapiResponse<StrapiEntity<StrapiVenue>[]>>('/venues');
    logger.info({ count: response.data.data.length }, 'Venues fetched successfully');
    return response.data.data;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch venues');
    throw new Error(`Failed to fetch venues: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search for a venue by name (fuzzy match)
 */
export async function getVenueByName(client: AxiosInstance, name: string): Promise<StrapiEntity<StrapiVenue> | null> {
  try {
    logger.info({ name }, 'Searching for venue by name...');

    // Strapi filter syntax for case-insensitive contains
    const response = await client.get<StrapiResponse<StrapiEntity<StrapiVenue>[]>>('/venues', {
      params: {
        'filters[name][$containsi]': name,
      },
    });

    if (response.data.data.length === 0) {
      logger.info({ name }, 'No venue found with this name');
      return null;
    }

    // Return exact match if found, otherwise first result
    const exactMatch = response.data.data.find(
      (v) => v.name.toLowerCase() === name.toLowerCase()
    );

    const venue = exactMatch || response.data.data[0];
    logger.info({ venueId: venue.id, venueName: venue.name }, 'Venue found');
    return venue;
  } catch (error) {
    logger.error({ error, name }, 'Failed to search venue');
    throw new Error(`Failed to search venue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new venue in Strapi with retry logic
 */
export async function createVenue(client: AxiosInstance, venue: StrapiVenue): Promise<StrapiEntity<StrapiVenue>> {
  try {
    logger.info({ venue }, 'Creating venue in Strapi...');

    const response = await retry(
      () =>
        client.post<StrapiResponse<StrapiEntity<StrapiVenue>>>('/venues', {
          data: venue,
        }),
      { maxAttempts: 3, delayMs: 1000, backoff: true }
    );

    // Log full response for debugging
    logger.debug({ responseData: response.data }, 'Venue creation response');

    // Check if response has expected structure
    if (!response.data || !response.data.data) {
      logger.error({ response: response.data }, 'Unexpected response structure from Strapi');
      throw new Error('Invalid response structure from Strapi API');
    }

    const venueData = response.data.data;
    logger.info(
      { venueId: venueData.id, venue: venueData },
      'Venue created successfully'
    );
    return venueData;
  } catch (error) {
    logger.error({ error, venue }, 'Failed to create venue after retries');
    throw new Error(`Failed to create venue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get all gigs from Strapi
 */
export async function getGigs(client: AxiosInstance): Promise<StrapiEntity<StrapiGig>[]> {
  try {
    logger.info('Fetching gigs from Strapi...');
    const response = await client.get<StrapiResponse<StrapiEntity<StrapiGig>[]>>('/gigs', {
      params: {
        populate: 'venue',
      },
    });
    logger.info({ count: response.data.data.length }, 'Gigs fetched successfully');
    return response.data.data;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch gigs');
    throw new Error(`Failed to fetch gigs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a gig already exists (by title and date)
 */
export async function gigExists(client: AxiosInstance, title: string, date: string): Promise<boolean> {
  try {
    const response = await client.get<StrapiResponse<StrapiEntity<StrapiGig>[]>>('/gigs', {
      params: {
        'filters[title][$eq]': title,
        'filters[date][$eq]': date,
      },
    });

    return response.data.data.length > 0;
  } catch (error) {
    logger.error({ error, title, date }, 'Failed to check gig existence');
    return false; // Assume doesn't exist on error to avoid blocking creation
  }
}

/**
 * Create a new gig in Strapi with retry logic
 */
export async function createGig(client: AxiosInstance, gig: StrapiGig): Promise<StrapiEntity<StrapiGig>> {
  try {
    logger.info({ gig }, 'Creating gig in Strapi...');

    const response = await retry(
      () =>
        client.post<StrapiResponse<StrapiEntity<StrapiGig>>>('/gigs', {
          data: gig,
        }),
      { maxAttempts: 3, delayMs: 1000, backoff: true }
    );

    logger.info(
      { gigId: response.data.data.id, gigTitle: response.data.data.title },
      'Gig created successfully'
    );
    return response.data.data;
  } catch (error) {
    logger.error({ error, gig }, 'Failed to create gig after retries');
    throw new Error(`Failed to create gig: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
