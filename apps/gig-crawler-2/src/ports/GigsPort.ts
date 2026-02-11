import type { Gig } from "../models/gig.js";
import type { Venue } from "../models/venue.js";

export interface GigsPort {
  /**
   * Find venue by name
   */
  findVenueByName(name: string): Promise<{ id: number; venue: Venue } | null>;

  /**
   * Create a new venue
   */
  createVenue(venue: Venue): Promise<number>;

  /**
   * Check if gig already exists
   */
  findGig(title: string, date: Date): Promise<number | null>;

  /**
   * Create a new gig
   */
  createGig(gig: Gig, venueId: number): Promise<number>;

  /**
   * Get existing venue ID or create new venue
   */
  getOrCreateVenue(venueName: string): Promise<number>;

  /**
   * Delete all gigs
   */
  deleteAllGigs(): Promise<number>;
}
