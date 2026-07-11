import { describe, it, expect } from "vitest";
import type { GigsPort } from "../src/ports/GigsPort.js";
import { RepairGigsCommand } from "../src/commands/RepairGigsCommand.js";
import { InMemoryGigsPort, TEST_DATE } from "./helpers.js";

/** Seed a stored gig exactly as legacy production rows look: venue name un-canonicalized. */
async function seed(port: GigsPort, title: string, venueName: string): Promise<void> {
  const venueId = await port.createVenue({ name: venueName });
  await port.createGig({ title, date: TEST_DATE, venueName, genres: [] }, venueId);
}

describe("RepairGigsCommand", () => {
  it("merges same-event rows whose titles drifted (subset billing)", async () => {
    const port = new InMemoryGigsPort();
    await seed(port, "Krista Papista Heartmode", "Πειραιως 260 - Πλατεια");
    await seed(port, "Krista Papista", "Πειραιως 260");
    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(1);
    expect(port.count()).toBe(1);
    expect(port.first().title).toBe("Krista Papista Heartmode");
    expect(port.first().venueName).toBe("Πειραιώς 260");
  });

  it("merges rows split across venue-spelling variants", async () => {
    const port = new InMemoryGigsPort();
    await seed(port, "Exotica Lunatica", "ΠΛΥΦΑ");
    await seed(port, "Exotica Lunatica", "PLYFA Building 7C");
    await seed(port, "Exotica Lunatica", "PLYFA");
    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(2);
    expect(port.count()).toBe(1);
    expect(port.first().venueName).toBe("PLYFA");
  });

  it("leaves distinct events on the same day+venue alone", async () => {
    const port = new InMemoryGigsPort();
    await seed(port, "Veronica Swift", "Gazarte");
    await seed(port, "Jazz Week on the roof", "Gazarte");
    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(0);
    expect(port.count()).toBe(2);
  });
});
