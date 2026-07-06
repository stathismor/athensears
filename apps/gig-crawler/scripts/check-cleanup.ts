/**
 * Fixture check for the deterministic title/venue cleaners (no LLM, no network, no DB).
 * Runs each case through the real pipeline order - normalizeVenueName() first, then
 * cleanEventTitle() with that venue - and fails (exit 1) on any mismatch. Add a row when
 * you spot a new title/venue pattern in the wild.
 *
 *   pnpm --filter gig-crawler check:cleanup
 */
import { cleanEventTitle } from "../src/utils/cleanTitle.js";
import { normalizeVenueName } from "../src/models/venueAliases.js";
import { ACTIVE_CITY } from "../src/models/city.js";

const city = ACTIVE_CITY.nameAliases;

// [rawTitle, rawVenue, expectedCleanTitle]
const TITLES: [string, string, string][] = [
  // venue / location / series tails
  [
    "Joe Lovano & Antonio Faraò - Κέντρο Πολιτισμού Ελληνικός Κόσμος (Αιθ. Αντιγόνη)",
    "«THEATRON», (Th. Antigoni), Ellinikos Kosmos",
    "Joe Lovano & Antonio Faraò",
  ],
  [
    "Σταύρος Λάντσιας Octet - Waving Hands - Φ hill Sessions Λόφος Φιλοπάππου",
    "Dora Stratou Theater",
    "Σταύρος Λάντσιας Octet - Waving Hands",
  ],
  [
    "Γιάννης Αγγελάκας & Νίκος Βελιώτης - Λύκοι Λάιβ - Φ hill Sessions Λόφος Φιλοπάππου",
    "Dora Stratou Theater",
    "Γιάννης Αγγελάκας & Νίκος Βελιώτης - Λύκοι Λάιβ",
  ],
  ["Some Band - Gagarin 205", "Gagarin 205", "Some Band"],
  // trailing date fragment (+ the " at <venue>" the source also appends)
  ["The Young Gods , 2/10 at Gazarte Ground Stage", "Gazarte", "The Young Gods"],
  ["Some Band - 12/10/2026", "Gagarin 205", "Some Band"],
  // must survive unchanged: co-headline bills, real subtitles, numbers-in-names
  ["Megadeth - Sepultura", "Gagarin 205", "Megadeth - Sepultura"],
  ["Mogwai - As the Love Continues", "Fuzz Club", "Mogwai - As the Love Continues"],
  ["Sum 41", "Gagarin 205", "Sum 41"],
  ["blink-182", "Gagarin 205", "blink-182"],
  ["AC/DC", "Gagarin 205", "AC/DC"],
];

// [rawVenue, expectedCanonical]
const VENUES: [string, string][] = [
  ["Θόλος - Κέντρο Πολιτισμού - Ίδρυμα «Σταύρος Νιάρχος»", "Σταύρος Νιάρχος"],
  ["Εθνικό Αστεροσκοπείο Αθηνών - Κέντρο Επισκεπτών Θησείου", "Εθνικό Αστεροσκοπείο Αθηνών"],
  ["Εθνικο Αστεροσκοπειο Αθηνων - Κεντρο Επισκεπτων Θησειου", "Εθνικό Αστεροσκοπείο Αθηνών"],
  // quote is a leading hall label, not the proper name -> left as-is
  ["«THEATRON», (Th. Antigoni), Ellinikos Kosmos", "«THEATRON», (Th. Antigoni), Ellinikos Kosmos"],
  ["κύτταρο", "Kyttaro"],
  ["Gagarin 205", "Gagarin 205"],
];

let failed = 0;

console.log("── venue names ──");
for (const [raw, expected] of VENUES) {
  const got = normalizeVenueName(raw);
  const ok = got === expected;
  if (!ok) {
    failed++;
  }
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(raw)} -> ${JSON.stringify(got)}`);
  if (!ok) {
    console.log(`     expected ${JSON.stringify(expected)}`);
  }
}

console.log("\n── titles ──");
for (const [raw, rawVenue, expected] of TITLES) {
  const venue = normalizeVenueName(rawVenue);
  const got = cleanEventTitle(raw, venue, city);
  const ok = got === expected;
  if (!ok) {
    failed++;
  }
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(raw)} -> ${JSON.stringify(got)}`);
  if (!ok) {
    console.log(`     expected ${JSON.stringify(expected)}`);
  }
}

console.log(`\n${failed === 0 ? "All cases passed." : `${failed} case(s) FAILED.`}`);
process.exit(failed === 0 ? 0 : 1);
