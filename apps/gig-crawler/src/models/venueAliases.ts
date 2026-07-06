import { normalizeDashes } from "../utils/cleanTitle.js";

/**
 * Maps known venue name variations to a canonical name.
 * Keys must be lowercase. The canonical name is what gets stored in Strapi.
 */
const VENUE_ALIASES: Record<string, string> = {
  // Gagarin
  gagarin205: "Gagarin 205",
  "gagarin 205": "Gagarin 205",
  "gagarin live music space": "Gagarin 205",
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

  // Gazarte
  gazarte: "Gazarte",
  "gazarte main stage": "Gazarte",
  "gazarte roof stage": "Gazarte",

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

/** Lowercase + strip diacritics, so the alias lookup is accent-insensitive. */
function foldKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+(?:19|20)\d{2}$/, "") // drop a trailing year ("Release Athens 2026")
    .trim();
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
