import { z } from "zod";

export const GigSchema = z.object({
  title: z.string(),
  date: z.date(),
  venueName: z.string(),
  description: z.string().optional(),
  price: z.string().optional(),
  url: z.string().optional(),
  /**
   * Up to 3 genres (most to least relevant). Always present: an empty array means the
   * act failed the genre filter, and such gigs are dropped before storage - so every
   * Gig that survives carries at least one. Stored, not rendered.
   */
  genres: z.array(z.string()),
  imageUrl: z.string().optional(),
  /** Registry id of the source that surfaced this gig (e.g. "more-com"). Provenance. */
  source: z.string().optional(),
  /**
   * Stable per-event identity within that source (its specific event URL, canonicalized).
   * Set once at collection and never rewritten, so the same event matches run-to-run even
   * after its title is edited by hand. Absent when the gig has no specific event link.
   */
  sourceKey: z.string().optional(),
});

export type Gig = z.infer<typeof GigSchema>;

export type GigStatus = "active" | "pruned" | "cancelled" | "hidden";

/**
 * Extra write fields for a gig create/update. Only the keys present are sent; Strapi's
 * update is a partial merge, so an omitted key leaves the stored value untouched - which
 * the reclean path relies on to preserve status/lastSeenAt/provenance while it rewrites
 * only titles and venues.
 */
export interface GigWriteExtra {
  manual?: boolean;
  status?: GigStatus;
  lastSeenAt?: string;
}

export const StrapiGigSchema = z.object({
  data: z.object({
    title: z.string(),
    date: z.string(), // ISO string for Strapi
    venue: z.number(), // venue ID
    description: z.string().optional(),
    price: z.string().optional(),
    url: z.string().optional(),
    genres: z.array(z.string()),
    source: z.string().optional(),
    sourceKey: z.string().optional(),
    manual: z.boolean().optional(),
    status: z.string().optional(),
    lastSeenAt: z.string().optional(),
    // imageUrl / deletedAt intentionally excluded - not written by the crawler here
  }),
});

export type StrapiGig = z.infer<typeof StrapiGigSchema>;

/**
 * Build the Strapi write payload. `source`/`sourceKey`/content come from the gig;
 * `manual`/`status`/`lastSeenAt` come from `extra`. Any field that resolves to undefined
 * is dropped from the JSON body, so Strapi's partial update leaves that column as-is.
 */
export function toStrapiGig(gig: Gig, venueId: number, extra: GigWriteExtra = {}): StrapiGig {
  return {
    data: {
      title: gig.title,
      date: gig.date.toISOString(),
      venue: venueId,
      description: gig.description,
      price: gig.price,
      url: gig.url,
      genres: gig.genres,
      source: gig.source,
      sourceKey: gig.sourceKey,
      manual: extra.manual,
      status: extra.status,
      lastSeenAt: extra.lastSeenAt,
    },
  };
}
