import { JSDOM, VirtualConsole } from "jsdom";
import { normalizePrice } from "./normalizePrice.js";

/**
 * Recursively collect schema.org offer prices (`price` / `lowPrice`) from a parsed
 * JSON-LD node - offers may be a single object, an array, or nested under `@graph`.
 */
function collectJsonLdPrices(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectJsonLdPrices(child, out);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const key of ["price", "lowPrice"]) {
    const value = obj[key];
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
    }
  }
  if (obj.offers) {
    collectJsonLdPrices(obj.offers, out);
  }
  if (obj["@graph"]) {
    collectJsonLdPrices(obj["@graph"], out);
  }
}

/**
 * Extract a ticket price from an event detail page's HTML - site- and city-agnostic.
 *
 * A generic fallback for when structured extraction produced no price: fetch the
 * event's detail page and look for a price in, in order of reliability:
 *   1. JSON-LD schema.org offers (`offers.price` / `lowPrice`) - standardized;
 *   2. microdata price props (`[itemprop="price"|"lowPrice"]`);
 *   3. price/money-styled elements (`.money`, `.price`, `[class*="price"]`) whose
 *      text carries a euro amount (so we don't grab unrelated numbers).
 *
 * All candidates are handed to normalizePrice, which keeps the lowest as one "€X".
 * Returns undefined when nothing price-like is found (e.g. a waiting-room/interstitial
 * page), so the caller just leaves the gig without a price.
 */
export function extractPriceFromHtml(html: string): string | undefined {
  const vc = new VirtualConsole();
  vc.on("error", () => {});
  const doc = new JSDOM(html, { virtualConsole: vc }).window.document;

  const candidates: string[] = [];

  // 1) JSON-LD offers - the most reliable, standardized source.
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      collectJsonLdPrices(JSON.parse(script.textContent || ""), candidates);
    } catch {
      // skip malformed JSON-LD
    }
  }

  // 2) Microdata price properties.
  if (candidates.length === 0) {
    for (const el of Array.from(
      doc.querySelectorAll('[itemprop="price"], [itemprop="lowPrice"]')
    )) {
      const value = el.getAttribute("content") || el.textContent || "";
      if (value.trim()) {
        candidates.push(value.trim());
      }
    }
  }

  // 3) Price/money-styled elements that mention a euro amount (a currency marker plus a
  // digit) - so we don't grab unrelated numbers from a loosely-classed element.
  if (candidates.length === 0) {
    for (const el of Array.from(
      doc.querySelectorAll('.money, .price, [class*="price"], [class*="Price"]')
    )) {
      const text = (el.textContent || "").trim();
      if (/(?:€|\beur\b)/i.test(text) && /\d/.test(text)) {
        candidates.push(text);
      }
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }
  return normalizePrice(candidates.join(", "));
}
