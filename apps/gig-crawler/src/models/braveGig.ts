import { z } from 'zod';

/**
 * Brave AI response format (before transformation)
 * Brave returns dates in YYYY-MM-DD format and venue as either string or object
 */
export const braveGigSchema = z.object({
  title: z.string(),
  date: z.string(), // YYYY-MM-DD format
  venue: z.union([
    z.string(), // Simple string format
    z.object({
      name: z.string(),
      address: z.string().optional(),
      website: z.string().optional(),
      neighborhood: z.string().optional(),
    }),
  ]),
  price: z.string().optional(),
  description: z.string().optional(),
  time_display: z.string().optional(),
});

export type BraveGig = z.infer<typeof braveGigSchema>;
