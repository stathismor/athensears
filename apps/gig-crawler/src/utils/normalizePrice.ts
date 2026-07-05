/**
 * Normalize a raw price string to a single canonical "€X" (the lowest number found),
 * or a keyword ("Free" / "Sold Out"), or undefined when there's no usable price.
 *
 * Sources quote prices every which way - "€16", "18€", "29,50", "€20-€30", a comma
 * list like "€47, €50, €52", or Greek "από 47€". We always keep the minimum as a
 * single value so the site shows one clean starting price, never a list.
 */
export function normalizePrice(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "€" || trimmed === "EUR") {
    return undefined;
  }
  if (/sold\s*out/i.test(trimmed)) {
    return "Sold Out";
  }
  if (/free/i.test(trimmed)) {
    return "Free";
  }

  // Extract all numeric values (handles €16, 18€, 29,50, 27.50, €20-€30, etc.)
  const numbers: number[] = [];
  const regex = /(\d+)[.,](\d+)|\d+/g;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    if (match[1] !== undefined) {
      // Has decimal part (e.g. 27.50 or 29,50)
      numbers.push(parseFloat(`${match[1]}.${match[2]}`));
    } else {
      numbers.push(parseInt(match[0], 10));
    }
  }

  if (numbers.length === 0) {
    return undefined;
  }

  const min = Math.min(...numbers);
  const amount = Math.floor(min);
  if (amount <= 0) {
    return undefined;
  }

  return `€${amount}`;
}
