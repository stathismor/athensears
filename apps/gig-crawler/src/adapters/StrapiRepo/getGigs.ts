import type { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { StrapiResponse, StrapiEntity } from '../../types/index.js';
import { StrapiGig } from '../../models/strapiGig.js';

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
