import { z } from 'zod';

/**
 * Strapi Gig schema (for API requests/responses)
 * Uses venue ID reference instead of full venue object
 */
export const strapiGigSchema = z.object({
  title: z.string().min(1).max(255),
  date: z.string().datetime(),
  time_display: z.string().max(20).optional(),
  price: z.string().max(50).optional(),
  description: z.string().optional(),
  venue: z.number().optional(), // venue ID reference
});

export type StrapiGig = z.infer<typeof strapiGigSchema>;
