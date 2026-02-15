import { z } from "zod";

export const VenueSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  website: z.string().optional(),
});

export type Venue = z.infer<typeof VenueSchema>;

export const StrapiVenueSchema = z.object({
  data: z.object({
    name: z.string(),
    address: z.string().optional(),
    website: z.string().optional(),
  }),
});

export type StrapiVenue = z.infer<typeof StrapiVenueSchema>;

export function toStrapiVenue(venue: Venue): StrapiVenue {
  return {
    data: {
      name: venue.name,
      address: venue.address,
      website: venue.website,
    },
  };
}
