// One-shot full sync runner for the local end-to-end test.
// Uses the real adapters + SyncGigsCommand, prints SyncStats, then exits.
import { PlaywrightAdapter } from "./src/adapters/ContentScraperRepo/PlaywrightAdapter.js";
import { GeminiAdapter } from "./src/adapters/GeminiRepo/GeminiAdapter.js";
import { StrapiAdapter } from "./src/adapters/StrapiRepo/StrapiAdapter.js";
import { SyncGigsCommand } from "./src/commands/SyncGigsCommand.js";

const scraper = new PlaywrightAdapter();
const cmd = new SyncGigsCommand(scraper, new GeminiAdapter(), new StrapiAdapter());
try {
  const stats = await cmd.execute();
  console.log("SYNCSTATS " + JSON.stringify(stats));
} catch (e) {
  console.log("SYNCERROR " + (e instanceof Error ? e.message : String(e)));
} finally {
  await scraper.close();
}
