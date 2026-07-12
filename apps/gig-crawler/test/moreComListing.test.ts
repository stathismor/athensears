import { describe, it, expect } from "vitest";
import { parseMoreComListing } from "../src/parsers/moreComListing.js";

const RANGE = { startDate: "2026-08-01", endDate: "2026-12-31" };
const BASE = "https://www.more.com/gr-en/tickets/music/";

/** A minimal more.com event card with the given genre class tokens. */
function card(title: string, slug: string, genres: string[]): string {
  const genreClasses = genres.map((g) => `music${g}d20260828`).join(" ");
  return `
    <article itemscope class="play-template default ${genreClasses} area1d20260828">
      <meta itemprop="startDate" content="2026-08-28T21:00:00" />
      <meta itemprop="url" content="/gr-en/tickets/music/${slug}/" />
      <h3 itemprop="name">${title}</h3>
      <div id="PlayVenue">Death Disco</div>
    </article>`;
}

describe("parseMoreComListing genre filter", () => {
  it("keeps an event carrying a keep genre", () => {
    const gigs = parseMoreComListing(card("Test Act", "test-act", ["industrial"]), BASE, RANGE);
    expect(gigs.map((g) => g.title)).toEqual(["Test Act"]);
    expect(gigs[0].genres).toEqual(["Industrial"]);
  });

  it("rejects a club night whose keep genre is co-tagged 'house'", () => {
    // The Alexandros Christopoulos case: a beach-club DJ card tagged house+industrial
    // must not slip the taste filter on the industrial co-tag.
    const html =
      card("Beach Resident DJ", "beach-dj", ["house", "industrial"]) +
      card("Real Band", "real-band", ["indie"]);
    const gigs = parseMoreComListing(html, BASE, RANGE);
    expect(gigs.map((g) => g.title)).toEqual(["Real Band"]);
  });

  it("still keeps acts co-tagged techno (not a reject marker)", () => {
    // Buzz Kull / Light Asylum / Autechre-shaped cards: keep genre + techno co-tag.
    const gigs = parseMoreComListing(
      card("Darkwave Act", "darkwave-act", ["indie", "techno"]),
      BASE,
      RANGE
    );
    expect(gigs.map((g) => g.title)).toEqual(["Darkwave Act"]);
  });
});
