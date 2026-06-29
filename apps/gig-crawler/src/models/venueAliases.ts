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

  // Release Athens festival (at Plateia Nerou, Palaio Faliro) — aggregators label it
  // variously by the square or the neighborhood; collapse them onto the festival.
  "plateia nerou": "Release Athens",
  "πλατεία νερού": "Release Athens",
  "πλατεια νερου": "Release Athens",
  "release athens": "Release Athens",
  "release athens festival": "Release Athens",
  "release athens 2026": "Release Athens",
  "palaio faliro": "Release Athens",
  "παλαιό φάληρο": "Release Athens",
  "παλαιο φαληρο": "Release Athens",
};

/**
 * Normalize a venue name to its canonical form.
 * Returns the canonical name if an alias is found, otherwise returns the original name trimmed.
 */
export function normalizeVenueName(name: string): string {
  const key = name.toLowerCase().trim();
  return VENUE_ALIASES[key] ?? name.trim();
}
