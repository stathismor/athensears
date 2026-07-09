import type { Gig, GigStatus, GigWriteExtra } from "../models/gig.js";
import type { Venue } from "../models/venue.js";

/**
 * A gig as stored in the CMS, read back for matching and maintenance passes. Carries the
 * identifiers, provenance, lifecycle status, and current field values so a caller can
 * decide whether an existing row needs updating and whether it may be touched at all.
 */
export interface StoredGig {
  documentId: string;
  title: string;
  date: Date;
  /** Current venue name from the populated relation; "" if the gig has no venue. */
  venueName: string;
  manual: boolean;
  status: GigStatus;
  url?: string;
  price?: string;
  description?: string;
  genres: string[];
  source?: string;
  sourceKey?: string;
}

/** One crawl run's journal entry. */
export interface SyncRunRecord {
  startedAt: string;
  finishedAt: string;
  /** How the run was started (e.g. "manual", "scheduler", "repair"). */
  trigger: string;
  status: "completed" | "failed";
  /** The run's counters (the SyncStats object). */
  counts: Record<string, number>;
  /** Short labels of the gigs created and updated this run. */
  affected: { created: string[]; updated: string[] };
  error?: string;
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
   * Find the stored gig that corresponds to this one, in two tiers: first by the stable
   * (source, sourceKey) identity (survives title edits), then by normalized title + day +
   * canonical venue. Returns the full stored row (including manual and status) so the
   * caller can leave manual/tombstoned gigs untouched and diff the rest.
   */
  findExistingGig(gig: Gig): Promise<StoredGig | null>;

  /**
   * Create a new gig (stamped active, seen now, non-manual, with its provenance).
   */
  createGig(gig: Gig, venueId: number): Promise<number>;

  /**
   * Update an existing gig (by Strapi documentId). `extra` sets manual/status/lastSeenAt;
   * omitted keys are left untouched (partial update), which the repair path uses to
   * preserve status/lastSeenAt/provenance while rewriting only the title/venue.
   */
  updateGig(documentId: string, gig: Gig, venueId: number, extra?: GigWriteExtra): Promise<number>;

  /**
   * Mark gigs as seen by the current run: refresh lastSeenAt and re-activate any that had
   * been removed, WITHOUT bumping updatedAt (so updatedAt stays a truthful "content changed"
   * signal). Used for gigs whose content did not change this run. Returns rows affected.
   */
  markSeen(documentIds: string[]): Promise<number>;

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
   * Append a run to the sync-run journal. Best-effort: implementations must not throw.
   */
  recordSyncRun(run: SyncRunRecord): Promise<void>;
}
