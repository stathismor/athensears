import type { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { StrapiResponse, StrapiEntity } from '../../types/index.js';
import { StrapiGig } from '../../models/strapiGig.js';

/**
 * Check if a gig already exists (by title and date)
 */
export async function gigExists(
  client: AxiosInstance,
  title: string,
  date: string
): Promise<boolean> {
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
