import type { Gig } from "../models/gig.js";
import type { Venue } from "../models/venue.js";

/**
 * A gig as stored in the CMS, read back for maintenance passes (e.g. the normalize
 * backfill). Carries the identifiers and the current venue name (from the populated
 * relation) so a caller can re-derive the cleaned form and diff it against what's stored.
 */
export interface StoredGig {
  documentId: string;
  title: string;
  date: Date;
  /** Current venue name from the populated relation; "" if the gig has no venue. */
  venueName: string;
  manual: boolean;
  url?: string;
  price?: string;
  description?: string;
  genres: string[];
}

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
   * Update an existing gig (by Strapi documentId). `manual` defaults to false (the crawler
   * only writes auto gigs); the normalize backfill passes the row's existing flag so a
   * re-cleaned manual gig stays manual.
   */
  updateGig(documentId: string, gig: Gig, venueId: number, manual?: boolean): Promise<number>;

  /**
   * Get existing venue ID or create new venue
   */
  getOrCreateVenue(venueName: string): Promise<number>;

  /**
   * Fetch every stored gig (paginated internally), with its venue populated. Used by
   * maintenance passes that reconcile stored rows against current cleaning rules.
   */
  listAllGigs(): Promise<StoredGig[]>;

  /**
   * Delete a single gig by Strapi documentId. Used to remove duplicates that cleaning
   * collapses onto an existing row.
   */
  deleteGig(documentId: string): Promise<void>;

  /**
   * Delete all gigs
   */
  deleteAllGigs(): Promise<number>;

  /**
   * Prune stale auto gigs: delete non-manual, future-dated gigs whose `updatedAt`
   * is older than `notSeenSince` (i.e. not seen by recent crawls). Returns the count.
   */
  pruneStaleGigs(notSeenSince: Date): Promise<number>;
}
