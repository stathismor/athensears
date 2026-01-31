import type { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { StrapiResponse, StrapiEntity } from '../../types/index.js';
import { StrapiVenue } from '../../models/strapiVenue.js';

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
