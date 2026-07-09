import type { GigsPort, StoredGig } from "../ports/GigsPort.js";
import type { Gig } from "../models/gig.js";
import { cleanEventTitle } from "../utils/cleanTitle.js";
import { normalizeVenueName } from "../models/venueAliases.js";
import { normalizeTitle } from "../utils/normalize.js";
import { ACTIVE_CITY } from "../models/city.js";
import { activeSources } from "../models/sources.js";
import { logger } from "../utils/logger.js";

/** A title/venue that the cleaners would rewrite in place. */
export interface RepairChange {
  documentId: string;
  fromTitle: string;
  toTitle: string;
  fromVenue: string;
  toVenue: string;
}

/** A duplicate that cleaning collapses onto a kept row (the loser is deleted). */
export interface RepairMerge {
  keptDocumentId: string;
  deletedDocumentId: string;
  title: string;
  date: string;
  venue: string;
}

export interface RepairReport {
  /** All gigs in the CMS. */
  total: number;
  /** Gigs considered (non-manual with a venue). */
  scanned: number;
  /** Manual gigs left untouched. */
  skippedManual: number;
  /** Gigs with no venue relation, skipped (can't safely re-point the venue). */
  skippedNoVenue: number;
  updated: RepairChange[];
  merged: RepairMerge[];
  unchanged: number;
  errors: number;
}

/** Count of populated optional fields - the tie-breaker for which duplicate to keep. */
function completeness(g: StoredGig): number {
  return [g.url, g.price, g.description, g.genres.length > 0].filter(Boolean).length;
}

/**
 * Re-apply the current cleaning rules to gigs already stored, in place. For every
 * considered gig it re-runs `cleanEventTitle` + `normalizeVenueName` (the same functions
 * the sync applies at write time) and, where the result differs, updates the row -
 * preserving its documentId (so permalinks survive) and its status/provenance/lastSeenAt
 * (Strapi's partial update leaves untouched anything we don't send). When cleaning
 * collapses two rows onto the same title+day+venue, it keeps the better-linked/more-complete
 * one, backfills its missing fields from the duplicate, and deletes the duplicate.
 *
 * Idempotent and safe to re-run whenever the cleaning rules change. It always leaves
 * hand-edited (manual) gigs untouched, never re-scrapes, and never drops rows a source no
 * longer lists - it only rewrites what's already stored.
 */
export class RepairGigsCommand {
  constructor(private readonly gigs: GigsPort) {}

  async execute(): Promise<RepairReport> {
    const city = ACTIVE_CITY.nameAliases;

    // Specific event page (2) > generic listing page (1) > no link (0) - which link to keep
    // when merging duplicates (mirrors the sync's dedup url scoring).
    const listingUrls = new Set(activeSources().flatMap((s) => s.listingUrls));
    const urlScore = (u?: string): number => (!u ? 0 : listingUrls.has(u) ? 1 : 2);

    const all = await this.gigs.listAllGigs();
    const report: RepairReport = {
      total: all.length,
      scanned: 0,
      skippedManual: 0,
      skippedNoVenue: 0,
      updated: [],
      merged: [],
      unchanged: 0,
      errors: 0,
    };

    // Consider auto gigs only; hand-edited (manual) gigs are always left alone.
    const considered = all.filter((g) => {
      if (g.manual) {
        report.skippedManual++;
        return false;
      }
      // No venue relation -> we can't re-point a venue safely (and cleaning leans on the
      // venue name); leave these for manual attention rather than guess.
      if (!g.venueName.trim()) {
        report.skippedNoVenue++;
        return false;
      }
      return true;
    });
    report.scanned = considered.length;

    // Derive the cleaned/canonical form for each gig and its post-clean identity key.
    type Desired = { gig: StoredGig; cleanTitle: string; canonicalVenue: string };
    const groups = new Map<string, Desired[]>();
    for (const gig of considered) {
      const canonicalVenue = normalizeVenueName(gig.venueName);
      const cleanTitle = cleanEventTitle(gig.title, canonicalVenue, city);
      const key = `${normalizeTitle(cleanTitle)}|${gig.date
        .toISOString()
        .slice(0, 10)}|${canonicalVenue.toLowerCase()}`;
      const entry = { gig, cleanTitle, canonicalVenue };
      const arr = groups.get(key);
      if (arr) {
        arr.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }

    for (const group of groups.values()) {
      try {
        // Keep the best-linked, then most-complete row; the rest are duplicates to merge away.
        group.sort(
          (a, b) =>
            urlScore(b.gig.url) - urlScore(a.gig.url) || completeness(b.gig) - completeness(a.gig)
        );
        const keeper = group[0];
        const losers = group.slice(1);

        // Backfill the keeper's missing fields from the duplicates, and adopt the best link.
        const bestUrl = group
          .map((d) => d.gig.url)
          .reduce((best, u) => (urlScore(u) > urlScore(best) ? u : best), keeper.gig.url);
        const merged: Gig = {
          title: keeper.cleanTitle,
          date: keeper.gig.date,
          venueName: keeper.canonicalVenue,
          url: bestUrl,
          price: keeper.gig.price ?? losers.find((d) => d.gig.price)?.gig.price,
          description:
            keeper.gig.description ?? losers.find((d) => d.gig.description)?.gig.description,
          genres:
            keeper.gig.genres.length > 0
              ? keeper.gig.genres
              : (losers.find((d) => d.gig.genres.length > 0)?.gig.genres ?? []),
        };

        const titleChanged = keeper.gig.title !== merged.title;
        const venueChanged = keeper.gig.venueName !== merged.venueName;
        const fieldsBackfilled =
          merged.url !== keeper.gig.url ||
          merged.price !== keeper.gig.price ||
          merged.description !== keeper.gig.description ||
          merged.genres.length !== keeper.gig.genres.length;

        // Update the keeper if cleaning changed it, or if absorbing a duplicate added a field.
        if (titleChanged || venueChanged || (losers.length > 0 && fieldsBackfilled)) {
          report.updated.push({
            documentId: keeper.gig.documentId,
            fromTitle: keeper.gig.title,
            toTitle: merged.title,
            fromVenue: keeper.gig.venueName,
            toVenue: merged.venueName,
          });
          const venueId = await this.gigs.getOrCreateVenue(merged.venueName);
          // Partial update: status/lastSeenAt/provenance are omitted, so they're preserved.
          await this.gigs.updateGig(keeper.gig.documentId, merged, venueId, {
            manual: keeper.gig.manual,
          });
        } else {
          report.unchanged++;
        }

        for (const loser of losers) {
          report.merged.push({
            keptDocumentId: keeper.gig.documentId,
            deletedDocumentId: loser.gig.documentId,
            title: merged.title,
            date: keeper.gig.date.toISOString().slice(0, 10),
            venue: merged.venueName,
          });
          await this.gigs.deleteGig(loser.gig.documentId);
        }
      } catch (error) {
        report.errors++;
        logger.error({ error, keeper: group[0]?.gig.documentId }, "Failed to repair gig group");
      }
    }

    logger.info(
      {
        total: report.total,
        scanned: report.scanned,
        updated: report.updated.length,
        merged: report.merged.length,
        unchanged: report.unchanged,
        skippedManual: report.skippedManual,
        skippedNoVenue: report.skippedNoVenue,
        errors: report.errors,
      },
      "Repair complete"
    );
    return report;
  }
}
