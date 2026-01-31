import type { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { retry } from '../../utils/retry.js';
import { StrapiResponse, StrapiEntity } from '../../types/index.js';
import { StrapiVenue } from '../../models/strapiVenue.js';

/**
 * Create a new venue in Strapi with retry logic
 */
export async function createVenue(
  client: AxiosInstance,
  venue: StrapiVenue
): Promise<StrapiEntity<StrapiVenue>> {
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
