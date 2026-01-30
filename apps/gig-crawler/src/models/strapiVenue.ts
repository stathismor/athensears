import { z } from 'zod';

/**
 * Strapi Venue schema (for API requests/responses)
 */
export const strapiVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().optional(),
  website: z.string().url().max(500).optional().or(z.literal('')),
  neighborhood: z.string().max(100).optional(),
});

export type StrapiVenue = z.infer<typeof strapiVenueSchema>;
