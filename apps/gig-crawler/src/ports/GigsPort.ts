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
   * Create the venue, or update its metadata (website/neighborhood/address) if it
   * already exists. Used to seed curated venues from the source registry so the
   * site can link them.
   */
  upsertVenue(venue: Venue): Promise<number>;

  /**
   * Check if a gig already exists (matched by title + calendar date).
   * Returns its identifiers and whether it was hand-edited (manual), so the
   * caller can update auto gigs while leaving manual ones untouched.
   */
  findGig(
    title: string,
    date: Date
  ): Promise<{ id: number; documentId: string; manual: boolean } | null>;

  /**
   * Create a new gig
   */
  createGig(gig: Gig, venueId: number): Promise<number>;

  /**
   * Update an existing gig (by Strapi documentId)
   */
  updateGig(documentId: string, gig: Gig, venueId: number): Promise<number>;

  /**
   * Get existing venue ID or create new venue
   */
  getOrCreateVenue(venueName: string): Promise<number>;

  /**
   * Delete all gigs
   */
  deleteAllGigs(): Promise<number>;
}
