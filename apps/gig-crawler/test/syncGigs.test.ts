import { describe, it, expect } from "vitest";
import { InMemoryGigsPort, makeGig, runSync, TEST_DATE } from "./helpers.js";

describe("SyncGigsCommand", () => {
  it("creates new gigs on a fresh store", async () => {
    const port = new InMemoryGigsPort();
    const stats = await runSync(port, [
      makeGig({ title: "Band A", url: "https://tickets.example/event/a" }),
      makeGig({ title: "Band B", url: "https://tickets.example/event/b" }),
    ]);
    expect(stats.gigsCreated).toBe(2);
    expect(port.count()).toBe(2);
  });

  it("collapses the same event surfaced twice in one run", async () => {
    const port = new InMemoryGigsPort();
    const stats = await runSync(port, [
      makeGig({ title: "Doom Fest" }),
      makeGig({ title: "Doom Fest" }),
    ]);
    expect(stats.gigsExtracted).toBe(1);
    expect(stats.gigsCreated).toBe(1);
    expect(port.count()).toBe(1);
  });

  it("collapses a partial billing into the fuller one (same day + venue)", async () => {
    const port = new InMemoryGigsPort();
    const stats = await runSync(port, [
      makeGig({ title: "Megadeth", url: "https://tickets.example/event/m" }),
      makeGig({ title: "Megadeth / Sepultura", url: "https://tickets.example/event/ms" }),
    ]);
    expect(stats.gigsCreated).toBe(1);
    expect(port.first().title).toBe("Megadeth / Sepultura");
  });

  it("keeps two distinct shows of the same act on different dates", async () => {
    const port = new InMemoryGigsPort();
    const laterDate = new Date("2026-09-20T20:00:00.000Z");
    const stats = await runSync(port, [
      makeGig({
        title: "Touring Act",
        date: TEST_DATE,
        url: "https://tickets.example/event/night1",
      }),
      makeGig({
        title: "Touring Act",
        date: laterDate,
        url: "https://tickets.example/event/night2",
      }),
    ]);
    expect(stats.gigsCreated).toBe(2);
    expect(port.count()).toBe(2);
  });

  it("re-syncing an unchanged gig heartbeats it instead of re-creating or updating", async () => {
    const port = new InMemoryGigsPort();
    await runSync(port, [makeGig({ title: "Stable Show" })]);
    const stats = await runSync(port, [makeGig({ title: "Stable Show" })]);
    expect(stats.gigsCreated).toBe(0);
    expect(stats.gigsUpdated).toBe(0);
    expect(stats.gigsSeen).toBe(1);
    expect(port.count()).toBe(1);
  });

  it("updates an existing gig in place when its content changed", async () => {
    const port = new InMemoryGigsPort();
    await runSync(port, [makeGig({ title: "Priced Show", price: "€10" })]);
    const stats = await runSync(port, [makeGig({ title: "Priced Show", price: "€20" })]);
    expect(stats.gigsCreated).toBe(0);
    expect(stats.gigsUpdated).toBe(1);
    expect(port.first().price).toBe("€20");
    expect(port.count()).toBe(1);
  });

  it("never overwrites a hand-edited (manual) gig, and never duplicates it", async () => {
    const port = new InMemoryGigsPort();
    await runSync(port, [makeGig({ title: "Handpicked", price: "€10" })]);
    port.markManual(port.first().documentId);

    const stats = await runSync(port, [makeGig({ title: "Handpicked", price: "€99" })]);
    expect(stats.gigsSkippedManual).toBe(1);
    expect(stats.gigsUpdated).toBe(0);
    expect(port.count()).toBe(1);
    expect(port.first().price).toBe("€10"); // human's value survives
  });

  it("does not resurrect a gig a human removed (hidden/cancelled)", async () => {
    const port = new InMemoryGigsPort();
    await runSync(port, [makeGig({ title: "Pulled Show" })]);
    port.setStatus(port.first().documentId, "hidden");

    const stats = await runSync(port, [makeGig({ title: "Pulled Show" })]);
    expect(stats.gigsSkippedTombstoned).toBe(1);
    expect(stats.gigsUpdated).toBe(0);
    expect(stats.gigsSeen).toBe(0);
    expect(port.first().status).toBe("hidden");
  });

  it("leaves existing gigs untouched when a run extracts nothing (non-destructive)", async () => {
    const port = new InMemoryGigsPort();
    await runSync(port, [makeGig({ title: "Keeper" })]);
    const stats = await runSync(port, []); // bad scrape night: nothing found
    expect(stats.gigsCreated).toBe(0);
    expect(stats.gigsUpdated).toBe(0);
    expect(port.count()).toBe(1);
  });

  it("matches a gig with no stable link by title + day + venue (no duplicate)", async () => {
    const port = new InMemoryGigsPort();
    await runSync(port, [makeGig({ title: "No Link Band", url: "" })]);
    const stats = await runSync(port, [makeGig({ title: "No Link Band", url: "", price: "€5" })]);
    expect(stats.gigsCreated).toBe(0);
    expect(stats.gigsUpdated).toBe(1);
    expect(port.count()).toBe(1);
  });
});
