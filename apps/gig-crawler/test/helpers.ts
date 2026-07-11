/**
 * Test doubles for the three ports the SyncGigsCommand depends on, plus a small helper to
 * drive a sync run. The point is to exercise the command's real orchestration logic
 * (dedup, the create/update/heartbeat decision, the manual + tombstone guards) against a
 * faithful in-memory GigsPort - no network, no browser, no LLM.
 */
import type { ScraperPort } from "../src/ports/ScraperPort.js";
import type { LLMPort } from "../src/ports/LLMPort.js";
import type { GigsPort, StoredGig, SyncRunRecord } from "../src/ports/GigsPort.js";
import type { Gig, GigStatus, GigWriteExtra } from "../src/models/gig.js";
import type { Venue } from "../src/models/venue.js";
import type { ScrapedContent } from "../src/models/scrapedContent.js";
import {
  SyncGigsCommand,
  type SyncOptions,
  type SyncStats,
} from "../src/commands/SyncGigsCommand.js";
import { normalizeTitle, titlesLikelySame } from "../src/utils/normalize.js";
import { normalizeVenueName } from "../src/models/venueAliases.js";

/** A scraper that always succeeds with trivial content - the fake LLM ignores it anyway. */
export class FakeScraper implements ScraperPort {
  async scrape(url: string): Promise<ScrapedContent> {
    return {
      url,
      success: true,
      text: "listing page content",
      rawHtml: "<html></html>",
      links: [],
    };
  }
  async scrapeMany(urls: string[]): Promise<ScrapedContent[]> {
    return Promise.all(urls.map((u) => this.scrape(u)));
  }
}

/** An LLM that returns a fixed set of gigs for the run, whatever pages it is handed. */
export class FakeLLM implements LLMPort {
  constructor(private readonly gigs: Gig[]) {}
  async extractGigsFromMultiplePages(): Promise<Gig[]> {
    // Fresh copies (incl. a fresh Date) so the command can't mutate the fixture.
    return this.gigs.map((g) => ({ ...g, date: new Date(g.date) }));
  }
  async filterEventDetailUrls(): Promise<string[]> {
    return [];
  }
}

/**
 * In-memory GigsPort that honours the contract documented on the port: two-tier matching
 * (stable source+sourceKey, then normalized title + day + canonical venue), partial
 * updates, and the manual/status flags. Venue names are canonicalized on write, exactly
 * as the Strapi adapter does, so matching behaves like production.
 */
export class InMemoryGigsPort implements GigsPort {
  private gigs = new Map<string, StoredGig>();
  private ids = new Map<string, number>();
  private venueIds = new Map<string, number>();
  private venueNames = new Map<number, string>();
  private nextGigId = 1;
  private nextVenueId = 1;
  readonly runs: SyncRunRecord[] = [];

  // ---- test-only helpers ----
  count(): number {
    return this.gigs.size;
  }
  all(): StoredGig[] {
    return [...this.gigs.values()];
  }
  first(): StoredGig {
    return this.all()[0];
  }
  markManual(documentId: string): void {
    const g = this.gigs.get(documentId);
    if (g) {
      g.manual = true;
    }
  }
  setStatus(documentId: string, status: GigStatus): void {
    const g = this.gigs.get(documentId);
    if (g) {
      g.status = status;
    }
  }

  // ---- GigsPort ----
  async findVenueByName(name: string): Promise<{ id: number; venue: Venue } | null> {
    const id = this.venueIds.get(name.toLowerCase());
    return id === undefined ? null : { id, venue: { name } };
  }
  async createVenue(venue: Venue): Promise<number> {
    const id = this.nextVenueId++;
    this.venueIds.set(venue.name.toLowerCase(), id);
    this.venueNames.set(id, venue.name);
    return id;
  }
  async upsertVenue(venue: Venue): Promise<number> {
    const existing = this.venueIds.get(venue.name.toLowerCase());
    return existing ?? this.createVenue(venue);
  }
  async getOrCreateVenue(venueName: string): Promise<number> {
    const canonical = normalizeVenueName(venueName);
    const key = canonical.toLowerCase();
    const existing = this.venueIds.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.nextVenueId++;
    this.venueIds.set(key, id);
    this.venueNames.set(id, canonical);
    return id;
  }
  async findExistingGig(gig: Gig): Promise<StoredGig | null> {
    // Tier 1: stable identity, survives title edits.
    if (gig.source && gig.sourceKey) {
      for (const g of this.gigs.values()) {
        if (g.source === gig.source && g.sourceKey === gig.sourceKey) {
          return { ...g };
        }
      }
    }
    // Tier 2: same calendar day + canonical venue, then exact normalized title first,
    // falling back to the same-event matcher - mirrors the Strapi adapter.
    const day = gig.date.toISOString().slice(0, 10);
    const title = normalizeTitle(gig.title);
    const venue = normalizeVenueName(gig.venueName).toLowerCase();
    const sameVenue = [...this.gigs.values()].filter(
      (g) =>
        g.date.toISOString().slice(0, 10) === day &&
        normalizeVenueName(g.venueName).toLowerCase() === venue
    );
    const match =
      sameVenue.find((g) => normalizeTitle(g.title) === title) ??
      sameVenue.find((g) => titlesLikelySame(g.title, gig.title));
    return match ? { ...match } : null;
  }
  async createGig(gig: Gig, venueId: number): Promise<number> {
    const id = this.nextGigId++;
    const documentId = `doc-${id}`;
    this.gigs.set(documentId, {
      documentId,
      title: gig.title,
      date: gig.date,
      venueName: this.venueNames.get(venueId) ?? gig.venueName,
      manual: false,
      status: "active",
      url: gig.url,
      price: gig.price,
      description: gig.description,
      genres: gig.genres ?? [],
      source: gig.source,
      sourceKey: gig.sourceKey,
    });
    this.ids.set(documentId, id);
    return id;
  }
  async updateGig(
    documentId: string,
    gig: Gig,
    venueId: number,
    extra: GigWriteExtra = {}
  ): Promise<number> {
    const g = this.gigs.get(documentId);
    if (!g) {
      throw new Error(`updateGig: ${documentId} not found`);
    }
    // Always-present fields.
    g.title = gig.title;
    g.date = gig.date;
    g.venueName = this.venueNames.get(venueId) ?? gig.venueName;
    g.genres = gig.genres ?? g.genres;
    // Optional fields: partial update - only overwrite when provided.
    if (gig.url !== undefined) {
      g.url = gig.url;
    }
    if (gig.price !== undefined) {
      g.price = gig.price;
    }
    if (gig.description !== undefined) {
      g.description = gig.description;
    }
    if (gig.source !== undefined) {
      g.source = gig.source;
    }
    if (gig.sourceKey !== undefined) {
      g.sourceKey = gig.sourceKey;
    }
    if (extra.manual !== undefined) {
      g.manual = extra.manual;
    }
    if (extra.status !== undefined) {
      g.status = extra.status;
    }
    return this.ids.get(documentId) ?? 0;
  }
  async markSeen(documentIds: string[]): Promise<number> {
    let n = 0;
    for (const id of documentIds) {
      const g = this.gigs.get(id);
      if (g) {
        g.status = "active";
        n++;
      }
    }
    return n;
  }
  async listAllGigs(): Promise<StoredGig[]> {
    return this.all().map((g) => ({ ...g }));
  }
  async deleteGig(documentId: string): Promise<void> {
    this.gigs.delete(documentId);
  }
  async deleteAllGigs(): Promise<number> {
    let n = 0;
    for (const [docId, g] of [...this.gigs.entries()]) {
      if (!g.manual) {
        this.gigs.delete(docId);
        n++;
      }
    }
    return n;
  }
  async recordSyncRun(run: SyncRunRecord): Promise<void> {
    this.runs.push(run);
  }
}

/** A far-enough-future date that sits inside the default crawl window. */
export const TEST_DATE = new Date("2026-08-15T20:00:00.000Z");

/** Build a Gig with sensible defaults; override any field per test. */
export function makeGig(overrides: Partial<Gig> = {}): Gig {
  return {
    title: "Test Band",
    date: TEST_DATE,
    venueName: "Fuzz Club",
    genres: ["rock"],
    url: "https://tickets.example/event/test-band",
    ...overrides,
  };
}

/**
 * Run one sync against the given store, with the LLM "extracting" exactly `gigs`. Pins the
 * run to a single deterministic aggregator source (so the venue the LLM returns is kept).
 */
export function runSync(
  port: GigsPort,
  gigs: Gig[],
  options: SyncOptions = {}
): Promise<SyncStats> {
  const command = new SyncGigsCommand(new FakeScraper(), new FakeLLM(gigs), port);
  return command.execute({ sources: ["ticketservices"], ...options });
}
