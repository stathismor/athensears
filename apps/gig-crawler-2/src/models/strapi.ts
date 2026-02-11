import { z } from "zod";

// Strapi 5 flattens the response - fields are directly on the entity
export const StrapiVenueEntitySchema = z.object({
  id: z.number(),
  documentId: z.string(),
  name: z.string(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
});

export type StrapiVenueEntity = z.infer<typeof StrapiVenueEntitySchema>;

export const StrapiGigEntitySchema = z.object({
  id: z.number(),
  documentId: z.string(),
  title: z.string(),
  date: z.string(),
  time_display: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  venue: z.union([
    z.number(),
    StrapiVenueEntitySchema,
    z.null()
  ]).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
});

export type StrapiGigEntity = z.infer<typeof StrapiGigEntitySchema>;

// Generic entity type for cases where we don't know the specific type
export type StrapiEntity = StrapiVenueEntity | StrapiGigEntity;

export const StrapiVenueResponseSchema = z.object({
  data: z.union([StrapiVenueEntitySchema, z.array(StrapiVenueEntitySchema)] as const).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const StrapiGigResponseSchema = z.object({
  data: z.union([StrapiGigEntitySchema, z.array(StrapiGigEntitySchema)] as const).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type StrapiVenueResponse = z.infer<typeof StrapiVenueResponseSchema>;
export type StrapiGigResponse = z.infer<typeof StrapiGigResponseSchema>;
