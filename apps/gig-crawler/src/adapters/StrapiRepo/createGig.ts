import type { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { retry } from '../../utils/retry.js';
import { StrapiResponse, StrapiEntity } from '../../types/index.js';
import { StrapiGig } from '../../models/strapiGig.js';

/**
 * Create a new gig in Strapi with retry logic
 */
export async function createGig(
  client: AxiosInstance,
  gig: StrapiGig
): Promise<StrapiEntity<StrapiGig>> {
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
