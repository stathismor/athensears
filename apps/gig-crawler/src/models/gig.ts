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
});

export type Gig = z.infer<typeof GigSchema>;

export const StrapiGigSchema = z.object({
  data: z.object({
    title: z.string(),
    date: z.string(), // ISO string for Strapi
    venue: z.number(), // venue ID
    description: z.string().optional(),
    price: z.string().optional(),
    url: z.string().optional(),
    genres: z.array(z.string()),
    // Always written false by the crawler so the column is never null (null slips past
    // "not manual" filters). Only ever called for auto gigs; manual gigs are skipped upstream.
    manual: z.boolean(),
    // imageUrl removed - Strapi schema doesn't support it
  }),
});

export type StrapiGig = z.infer<typeof StrapiGigSchema>;

/**
 * `manual` defaults to false - the crawler only ever writes auto gigs, so callers omit it.
 * The normalize/backfill path passes the row's existing flag through, so re-cleaning a
 * hand-edited gig (opt-in) doesn't silently demote it to auto.
 */
export function toStrapiGig(gig: Gig, venueId: number, manual = false): StrapiGig {
  return {
    data: {
      title: gig.title,
      date: gig.date.toISOString(),
      venue: venueId,
      description: gig.description,
      price: gig.price,
      url: gig.url,
      genres: gig.genres,
      manual,
      // imageUrl intentionally excluded - Strapi schema doesn't support it
    },
  };
}
