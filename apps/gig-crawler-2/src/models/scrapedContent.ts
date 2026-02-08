import { z } from "zod";

export const ScrapedContentSchema = z.object({
  url: z.string(),
  text: z.string().optional(),
  rawHtml: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type ScrapedContent = z.infer<typeof ScrapedContentSchema>;
