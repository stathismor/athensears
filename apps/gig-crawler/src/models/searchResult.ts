import { z } from "zod";

export const SearchResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
