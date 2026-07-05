#!/usr/bin/env tsx
/**
 * Scrape one or more pages and show what we'd extract from them - WITHOUT calling
 * Gemini or writing to Strapi. Zero LLM cost. Use it to test the scraper (including
 * cookie/redirect handling for gated sites like more.com) and the deterministic price
 * extractor on a specific page.
 *
 *   pnpm test:page <url> [url2 ...]
 *   # or: tsx --env-file=.env scripts/test-page.ts <url>
 *
 * (An .env with GEMINI_API_KEY / STRAPI_API_TOKEN present is only needed so config
 * parses - this script never calls either service.)
 */
import { PlaywrightAdapter } from "../src/adapters/ContentScraperRepo/PlaywrightAdapter.js";
import { extractPriceFromHtml } from "../src/utils/extractPrice.js";

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Usage: pnpm test:page <url> [url2 ...]");
  process.exit(1);
}

const scraper = new PlaywrightAdapter();
try {
  for (const url of urls) {
    const sc = await scraper.scrape(url);
    console.log(`\n=== ${url} ===`);
    console.log("success:", sc.success);
    if (!sc.success) {
      console.log("error:", sc.error);
      continue;
    }
    const price = sc.rawHtml ? extractPriceFromHtml(sc.rawHtml) : undefined;
    console.log("price (deterministic):", price ?? "(none found)");
    console.log("links:", sc.links?.length ?? 0);
    console.log("text length:", sc.text?.length ?? 0);
    console.log("has structured data:", (sc.text ?? "").startsWith("[Structured Data]"));
    console.log("text preview:", (sc.text ?? "").slice(0, 300).replace(/\s+/g, " "));
  }
} finally {
  await scraper.close();
}
