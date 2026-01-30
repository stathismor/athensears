import { z } from 'zod';
import { venueSchema } from './venue.js';

/**
 * Extracted gig data schema (from AI before venue ID resolution)
 */
export const gigSchema = z
  .object({
    title: z.string().min(1).max(255),
    date: z.string().datetime(),
    time_display: z.string().max(20).optional().default('21:00'),
    price: z.string().max(50).optional(),
    description: z.string().optional(),
    venue: venueSchema,
  })
  .refine(
    (data) => {
      // Validate date is in future
      const gigDate = new Date(data.date);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return gigDate >= now;
    },
    {
      message: 'Date must be in the future',
      path: ['date'],
    }
  );

export type Gig = z.infer<typeof gigSchema>;
