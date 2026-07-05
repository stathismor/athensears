import { createHash } from "node:crypto";
import type { Gig } from "../../models/gig.js";
import { env } from "../../models/env.js";
import { logger } from "../../utils/logger.js";
import type { CacheEntry, CacheRecord, PageCacheStore, SerializedGig } from "./types.js";
import { StrapiCacheStore } from "./StrapiCacheStore.js";

/**
 * Cross-run cache of LLM extraction results, keyed by scraped-page content.
 *
 * Every nightly run would otherwise re-send every (mostly-unchanged) event page to
 * Gemini. This cache lets the crawler skip the extraction call for a page whose
 * content hash matches a recent run and replay the stored gigs - the single biggest
 * cost lever, since extraction is >95% of token spend.
 *
 * In-memory it is a `url -> { hash, extractedAt, gigs }` map. Persistence is delegated
 * to a {@link PageCacheStore} (Strapi/Postgres by default) so there is no reliance on
 * local files or volumes. Lifecycle per sync run: `load()` once up front, `get`/`set`
 * during extraction, `flush()` once at the end.
 *
 * Fail-safe: if the backing store is disabled or unreachable, the cache reports every
 * lookup as a miss and never writes, so behaviour is identical to a cache-less crawler
 * - a cache outage slows a run (more Gemini calls) but never breaks it.
 *
 * Correctness notes:
 * - Stored gigs are the model's already-date-filtered output. Callers MUST re-apply
 *   the current date window to replayed gigs (the window shifts daily); the
 *   GeminiAdapter does - this cache is date-agnostic.
 * - Entries carry an extractedAt timestamp; reads older than CRAWLER_CACHE_TTL_DAYS
 *   miss (and are pruned on load), so far-future events entering the window and any
 *   missed page edits self-heal within the TTL even if the page bytes never change.
 */

function serialize(gig: Gig): SerializedGig {
  return { ...gig, date: gig.date.toISOString() };
}

function deserialize(sg: SerializedGig): Gig {
  return { ...sg, date: new Date(sg.date) };
}

export class PageExtractionCache {
  private readonly store: PageCacheStore | null;
  private readonly ttlMs: number;
  private record: CacheRecord = {};
  private available = false; // true only after a successful load()
  private dirty = false;

  constructor(
    store: PageCacheStore | null = env.CRAWLER_CACHE_ENABLED ? new StrapiCacheStore() : null
  ) {
    this.store = store;
    this.ttlMs = Math.max(0, env.CRAWLER_CACHE_TTL_DAYS) * 86_400_000;
  }

  /** SHA-256 of the exact content string that would be sent to the LLM. */
  static hash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  get enabled(): boolean {
    return this.store !== null;
  }

  /**
   * Prepare the cache for a run: load from the backend and prune expired entries. Must
   * be awaited once before extraction. On any failure - or when `useCache` is false -
   * the cache stays unavailable (all misses, no writes) so the run proceeds without it.
   * Resetting `available`/`record` here matters because the adapter is a long-lived
   * singleton: a bypass run must not see the previous run's in-memory entries.
   */
  async load(useCache = true): Promise<void> {
    this.available = false;
    this.record = {};
    this.dirty = false;

    if (!useCache) {
      logger.info("Extraction cache bypassed for this run (useCache=false)");
      return;
    }
    if (!this.store) {
      logger.info("Extraction cache disabled (CRAWLER_CACHE_ENABLED=false)");
      return;
    }
    try {
      const loaded = await this.store.load();
      const now = Date.now();
      const pruned: CacheRecord = {};
      let droppedExpired = 0;
      for (const [url, entry] of Object.entries(loaded)) {
        if (this.isFresh(entry, now)) {
          pruned[url] = entry;
        } else {
          droppedExpired++;
        }
      }
      this.record = pruned;
      this.dirty = droppedExpired > 0; // persist the pruned set on flush
      this.available = true;
      logger.info(
        {
          entries: Object.keys(pruned).length,
          droppedExpired,
          ttlDays: env.CRAWLER_CACHE_TTL_DAYS,
        },
        "Extraction cache loaded"
      );
    } catch (error) {
      this.available = false;
      logger.warn({ error }, "Failed to load extraction cache - this run proceeds without it");
    }
  }

  private isFresh(entry: CacheEntry, now: number): boolean {
    if (this.ttlMs === 0) {
      return true;
    }
    const age = now - new Date(entry.extractedAt).getTime();
    return age >= 0 && age <= this.ttlMs;
  }

  /**
   * Return the cached gigs for `url` iff a non-expired entry exists whose hash matches
   * `hash`, else null (a miss → the caller must extract). An empty array is a valid
   * hit: it records "this page yielded no gigs", still worth skipping the LLM call.
   */
  get(url: string, hash: string): Gig[] | null {
    if (!this.available) {
      return null;
    }
    const entry = this.record[url];
    if (!entry || entry.hash !== hash || !this.isFresh(entry, Date.now())) {
      return null;
    }
    return entry.gigs.map(deserialize);
  }

  /** Record the extraction result for `url` at content `hash`. */
  set(url: string, hash: string, gigs: Gig[]): void {
    if (!this.available) {
      return;
    }
    this.record[url] = {
      hash,
      extractedAt: new Date().toISOString(),
      gigs: gigs.map(serialize),
    };
    this.dirty = true;
  }

  /** Persist the cache to its backend if anything changed. Call once at end of a run. */
  async flush(): Promise<void> {
    if (!this.store || !this.available || !this.dirty) {
      return;
    }
    try {
      await this.store.save(this.record);
      this.dirty = false;
      logger.info({ entries: Object.keys(this.record).length }, "Extraction cache flushed");
    } catch (error) {
      logger.warn({ error }, "Failed to flush extraction cache");
    }
  }
}
