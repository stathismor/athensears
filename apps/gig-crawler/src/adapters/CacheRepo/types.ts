import type { Gig } from "../../models/gig.js";

/** A Gig with its Date serialized to an ISO string for JSON storage. */
export type SerializedGig = Omit<Gig, "date"> & { date: string };

/** One cached page: the content hash it was extracted at + the resulting gigs. */
export interface CacheEntry {
  hash: string;
  extractedAt: string; // ISO
  gigs: SerializedGig[];
}

/** The whole cache: scraped-page URL → its entry. */
export type CacheRecord = Record<string, CacheEntry>;

/**
 * Persistence backend for the extraction cache. Implementations own only load/save
 * of the opaque record; hashing, TTL and in-memory lookup live in PageExtractionCache.
 */
export interface PageCacheStore {
  /** Load the full cache record. Return {} when nothing has been stored yet. */
  load(): Promise<CacheRecord>;
  /** Overwrite the full cache record. */
  save(record: CacheRecord): Promise<void>;
}
