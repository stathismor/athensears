import type { Gig } from '../models/gig.js';

/**
 * Port for searching and extracting gig data from external sources
 */
export interface SearchPort {
  /**
   * Search for Athens music events and extract structured gig data
   * @returns Array of gigs with venue information
   */
  searchAndExtractGigs(): Promise<Gig[]>;
}
