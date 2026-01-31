import type { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { StrapiResponse, StrapiEntity } from '../../types/index.js';
import { StrapiVenue } from '../../models/strapiVenue.js';

/**
 * Search for a venue by name (fuzzy match)
 */
export async function getVenueByName(
  client: AxiosInstance,
  name: string
): Promise<StrapiEntity<StrapiVenue> | null> {
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
