import { z } from "zod";

export const GigSchema = z.object({
  title: z.string(),
  date: z.date(),
  venueName: z.string(),
  description: z.string().optional(),
  price: z.string().optional(),
  url: z.string().optional(),
  /**
   * Up to 3 genres (most to least relevant). Also the taste backstop: an empty array
   * means the act failed the genre filter and the gig is dropped. Stored, not rendered.
   */
  genres: z.array(z.string()).optional(),
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
    genres: z.array(z.string()).optional(),
    // imageUrl removed - Strapi schema doesn't support it
  }),
});

export type StrapiGig = z.infer<typeof StrapiGigSchema>;

export function toStrapiGig(gig: Gig, venueId: number): StrapiGig {
  return {
    data: {
      title: gig.title,
      date: gig.date.toISOString(),
      venue: venueId,
      description: gig.description,
      price: gig.price,
      url: gig.url,
      genres: gig.genres,
      // imageUrl intentionally excluded - Strapi schema doesn't support it
    },
  };
}
