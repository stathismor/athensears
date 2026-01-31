import type { StrapiEntity } from '../types/index.js';
import type { StrapiGig } from '../models/strapiGig.js';
import type { StrapiVenue } from '../models/strapiVenue.js';

/**
 * Port for gig and venue repository operations
 */
export interface GigsPort {
  // Venue operations
  getVenues(): Promise<StrapiEntity<StrapiVenue>[]>;
  getVenueByName(name: string): Promise<StrapiEntity<StrapiVenue> | null>;
  createVenue(venue: StrapiVenue): Promise<StrapiEntity<StrapiVenue>>;

  // Gig operations
  getGigs(): Promise<StrapiEntity<StrapiGig>[]>;
  gigExists(title: string, date: string): Promise<boolean>;
  createGig(gig: StrapiGig): Promise<StrapiEntity<StrapiGig>>;
}
