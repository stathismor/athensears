import { z } from 'zod';

/**
 * Venue schema
 */
export const venueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().optional(),
  website: z.string().url().max(500).optional().or(z.literal('')),
  neighborhood: z.string().max(100).optional(),
});

export type Venue = z.infer<typeof venueSchema>;
