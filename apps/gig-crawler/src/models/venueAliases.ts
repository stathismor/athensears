import { normalizeDashes } from "../utils/cleanTitle.js";
import { normalizeTitle } from "../utils/normalize.js";

/**
 * Maps known venue name variations to a canonical name.
 * Keys must be lowercase. The canonical name is what gets stored in Strapi.
 */
const VENUE_ALIASES: Record<string, string> = {
  // Gagarin
  gagarin205: "Gagarin 205",
  "gagarin 205": "Gagarin 205",
  "gagarin live music space": "Gagarin 205",
  "gagarin 205 live music space": "Gagarin 205",
  gagarin: "Gagarin 205",

  // An Club
  "an club": "AN Club",
  "a.n. club": "AN Club",
  "an club (αναρχικό νοσοκομείο)": "AN Club",

  // Six Dogs
  "six dogs": "Six Dogs",
  "six d.o.g.s": "Six Dogs",
  "six d.o.g.s.": "Six Dogs",

  // Fuzz Club
  fuzz: "Fuzz Club",
  "fuzz club": "Fuzz Club",
  "fuzz live music club": "Fuzz Club",

  // Floyd (aggregators write it ALL-CAPS)
  floyd: "Floyd",

  // Death Disco
  "death disco": "Death Disco",
  deathdisco: "Death Disco",

  // Temple
  "temple athens": "Temple",
  temple: "Temple",
  "temple live": "Temple",

  // Kyttaro
  kyttaro: "Kyttaro",
  "kyttaro live": "Kyttaro",
  κύτταρο: "Kyttaro",

  // Piraeus 117 Academy
  "piraeus 117 academy": "Piraeus 117 Academy",
  "piraeus academy": "Piraeus 117 Academy",
  "academy 117": "Piraeus 117 Academy",

  // Ιλιον Plus
  "ilion plus": "Ilion Plus",
  "ίλιον plus": "Ilion Plus",
  "ιλιον plus": "Ilion Plus",

  // Romantso
  romantso: "Romantso",
  ρομάντσο: "Romantso",

  // Bios
  bios: "Bios",
  "β|ος": "Bios",

  // Gazarte (foldKey drops punctuation, so "Gazarte - Roof Stage" also lands here)
  gazarte: "Gazarte",
  "gazarte main stage": "Gazarte",
  "gazarte roof stage": "Gazarte",

  // PLYFA (former gasworks laundry, Votanikos) - sources write it in either script,
  // sometimes with the building annex.
  plyfa: "PLYFA",
  πλυφα: "PLYFA",
  "plyfa building 7c": "PLYFA",

  // Peiraios 260 (Athens Epidaurus Festival industrial venue) - sources append the
  // sub-space ("Πλατεία", "Χώρος Δ/Ε/Η"); collapse onto the venue.
  "πειραιώς 260": "Πειραιώς 260",
  "πειραιώς 260 πλατεία": "Πειραιώς 260",
  "πειραιώς 260 χώρος δ": "Πειραιώς 260",
  "πειραιώς 260 χώρος ε": "Πειραιώς 260",
  "πειραιώς 260 χώρος η": "Πειραιώς 260",
  "peiraios 260": "Πειραιώς 260",
  "piraeus 260": "Πειραιώς 260",

  // Stoa Culture - sources write the atrium variant ("Αίθριο Στοά Culture") and
  // mixed-script forms (a Latin "A" in "Aίθριο" folds to the Greek one).
  "στοά culture": "Στοά Culture",
  "αίθριο στοά culture": "Στοά Culture",

  // Papagou Garden Theatre - the municipal prefix comes and goes.
  "κηποθέατρο παπάγου": "Κηποθέατρο Παπάγου",
  "δημοτικό κηποθέατρο παπάγου": "Κηποθέατρο Παπάγου",

  // Release Athens festival (at Plateia Nerou, Palaio Faliro) - aggregators label it
  // variously by the square or the neighborhood; collapse them onto the festival.
  "plateia nerou": "Release Athens",
  "πλατεία νερού": "Release Athens",
  "πλατεια νερου": "Release Athens",
  "release athens": "Release Athens",
  "release athens festival": "Release Athens",
  "palaio faliro": "Release Athens",
  "παλαιό φάληρο": "Release Athens",
  "παλαιο φαληρο": "Release Athens",

  // National Observatory of Athens - the source tacks its "Visitor Centre, Thiseio"
  // sub-facility onto the institution name; keep only the institution. (SNFCC and other
  // "descriptor - «Proper Name»" venues are handled generically by the quoted-name rule.)
  "εθνικο αστεροσκοπειο αθηνων - κεντρο επισκεπτων θησειου": "Εθνικό Αστεροσκοπείο Αθηνών",
};

/**
 * Venue-name matching key: the same case/script/accent/punctuation folding titles get
 * (so "Gazarte - Roof Stage" hits the "gazarte roof stage" alias and Greek/Latin
 * homoglyph spellings match), plus dropping a trailing year ("Release Athens 2026").
 */
function foldKey(s: string): string {
  return normalizeTitle(s).replace(/\s(?:19|20)\d{2}$/, "");
}

/** Alias map re-keyed on the accent-folded form, built once. */
const FOLDED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(VENUE_ALIASES).map(([k, v]) => [foldKey(k), v])
);

/**
 * A quoted proper name at the *end* of a venue string - the recognizable name in
 * institutional venues written as "descriptor - descriptor - «Proper Name»" (e.g.
 * "Θόλος - Κέντρο Πολιτισμού - Ίδρυμα «Σταύρος Νιάρχος»" -> "Σταύρος Νιάρχος"). Anchoring
 * to the end deliberately ignores a leading hall label like "«THEATRON», … Ellinikos
 * Kosmos", where the quoted part is not the venue's recognizable name.
 */
function quotedNameAtEnd(s: string): string | null {
  const m = s.match(/[«"“]([^«»"“”]{3,})[»"”][\s).]*$/u);
  return m ? m[1].trim() : null;
}

/**
 * Normalize a venue name to its canonical form. Returns, in order of precedence: a mapped
 * alias (accent-insensitive), a quoted proper name at the end of the string, or the
 * dash-normalized original.
 */
export function normalizeVenueName(name: string): string {
  // Normalize fancy dashes to a plain hyphen first, so both the alias lookup and the
  // stored/displayed venue name are consistent.
  const clean = normalizeDashes(name).trim();
  const aliased = FOLDED_ALIASES[foldKey(clean)];
  if (aliased) {
    return aliased;
  }
  return quotedNameAtEnd(clean) ?? clean;
}
