import { JSDOM, VirtualConsole } from "jsdom";
import type { Gig } from "../models/gig.js";
import { normalizeVenueName } from "../models/venueAliases.js";
import { logger } from "../utils/logger.js";

/**
 * more.com genre class tokens (the `music<genre>` classes on each event card) that map
 * onto our curated indie/alternative taste. An event is kept only if it carries at least
 * one of these; the value is the label stored on the gig.
 */
const KEEP_GENRES: Record<string, string> = {
  rock: "Rock",
  indie: "Indie",
  metal: "Metal",
  jazz: "Jazz",
  blues: "Blues",
  industrial: "Industrial",
  reggae: "Reggae",
};

/**
 * Genre tokens marking Greek popular / éntechno / laïkó / world / opera. more.com often
 * co-tags these with "rock", so an event carrying any of them is rejected even when a
 * keep-genre is also present (e.g. a Greek éntechno act tagged rock+artmusic+rebetiko).
 */
const STRONG_REJECT_GENRES = new Set([
  "rebetiko",
  "rebetiki",
  "artmusic",
  "traditional",
  "ethnic",
  "opera",
  "latin",
]);

/** Titles that are never curated indie taste, regardless of the genre bucket. */
const REJECT_TITLE =
  /\b(tribute|cover band|the music of|the musical|musical|gala|disney|symphonic)\b|παιδικ|χριστουγενν/i;

/** more.com tags each event's region with an `area<N>` class; area 1 is Attica (Athens). */
const ATTICA_AREA = "1";

interface DateRange {
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate: string; // YYYY-MM-DD (inclusive)
}

/** Drop redundant "live in Athens" tails so titles read as just the act. */
function cleanTitle(raw: string): string {
  const cleaned = raw
    .replace(/\s*[-–—]?\s*live\s+(?:in|at)\s+athens\b/i, "")
    .replace(/\s*[-–—]?\s*live\s+στην\s+αθήνα\b/i, "")
    .replace(/\s*[-–—]?\s*στην\s+αθήνα\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || raw.trim();
}

/**
 * Deterministically extract Athens gigs from a more.com music listing page.
 *
 * more.com is a legacy, server-rendered ASP.NET site: the listing HTML embeds every
 * event as schema.org microdata — `<article itemtype=".../Event">` carrying startDate,
 * venue (`#PlayVenue`), url and image metas, with genre in `music<genre>` class tokens
 * and region in an `area<N>` class. Its event *detail* pages sit behind a Queue-It
 * waiting room, so we take everything from the (open, plain-HTTP) listing.
 *
 * We keep only Attica (area 1) events whose genre fits the curated taste filter and
 * whose title isn't an obvious tribute/gala. Returned gigs carry no price (that lives on
 * the gated checkout page) and feed the normal dedup + upsert pipeline unchanged.
 */
export function parseMoreComListing(html: string, baseUrl: string, dateRange: DateRange): Gig[] {
  const vc = new VirtualConsole();
  vc.on("error", () => {});
  const doc = new JSDOM(html, { virtualConsole: vc }).window.document;
  const origin = new URL(baseUrl).origin;

  const gigs: Gig[] = [];
  let atticaEvents = 0;

  for (const article of Array.from(doc.querySelectorAll("article[itemscope]"))) {
    const cls = article.className || "";

    // Region filter: Attica (Athens) only.
    const areaMatch = cls.match(/\barea(\d+)d\d{8}\b/);
    if (!areaMatch || areaMatch[1] !== ATTICA_AREA) {
      continue;
    }
    atticaEvents++;

    // Genre taste filter from the `music<genre>` class tokens.
    const genres = [...cls.matchAll(/\bmusic([a-z]+)d\d{8}\b/g)].map((m) => m[1]);
    const keepGenre = genres.find((g) => g in KEEP_GENRES);
    if (!keepGenre || genres.some((g) => STRONG_REJECT_GENRES.has(g))) {
      continue;
    }

    const startDate = article.querySelector("meta[itemprop='startDate']")?.getAttribute("content");
    const rawTitle = (
      article.querySelector("h3[itemprop='name'], .playinfo__title")?.textContent ||
      article.querySelector("meta[itemprop='description']")?.getAttribute("content") ||
      ""
    ).trim();
    const href =
      article.querySelector("meta[itemprop='url']")?.getAttribute("content") ||
      article.querySelector("a[href]")?.getAttribute("href");
    const venueRaw = (article.querySelector("#PlayVenue")?.textContent || "").trim();

    if (!startDate || !rawTitle || !href || !venueRaw) {
      continue;
    }
    if (REJECT_TITLE.test(rawTitle)) {
      continue;
    }

    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const day = date.toISOString().slice(0, 10);
    if (day < dateRange.startDate || day > dateRange.endDate) {
      continue;
    }

    let url: string;
    try {
      url = new URL(href, origin).toString();
    } catch {
      continue;
    }

    let imageUrl: string | undefined;
    const image = article.querySelector("meta[itemprop='image']")?.getAttribute("content");
    if (image) {
      try {
        imageUrl = new URL(image, origin).toString();
      } catch {
        imageUrl = undefined;
      }
    }

    gigs.push({
      title: cleanTitle(rawTitle),
      date,
      venueName: normalizeVenueName(venueRaw),
      url,
      genre: KEEP_GENRES[keepGenre],
      imageUrl,
    });
  }

  logger.info(
    { source: "more-com", atticaEvents, kept: gigs.length },
    "Parsed more.com listing (structured microdata)"
  );
  return gigs;
}
