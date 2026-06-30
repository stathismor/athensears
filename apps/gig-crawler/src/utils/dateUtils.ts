/**
 * Parse a gig date into a Date anchored at **noon UTC of the intended calendar day**.
 *
 * Gigs are calendar-day events (the time of day lives in `time_display`). Anchoring at
 * noon UTC keeps the day stable through `toISOString()` storage, range filtering,
 * `findGig` matching, and frontend `getDate()` rendering, regardless of server timezone.
 * The previous implementation built dates at *local* midnight (`new Date(y, m, d)`),
 * which serialized back a day in any positive-offset timezone (e.g. Athens UTC+3).
 */
export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) {
    return null;
  }
  const s = dateStr.trim();

  let y: number | undefined;
  let mo: number | undefined;
  let d: number | undefined;

  // ISO date / datetime: take the literal Y-M-D (ignore any time/zone)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    y = parseInt(m[1], 10);
    mo = parseInt(m[2], 10);
    d = parseInt(m[3], 10);
  } else {
    // DD/MM/YYYY or DD-MM-YYYY (Greek pages use day-first)
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      d = parseInt(m[1], 10);
      mo = parseInt(m[2], 10);
      y = parseInt(m[3], 10);
    }
  }

  // Last resort: let Date parse it, then take its UTC calendar day
  if (y === undefined || mo === undefined || d === undefined) {
    const parsed = new Date(s);
    if (isNaN(parsed.getTime())) {
      return null;
    }
    y = parsed.getUTCFullYear();
    mo = parsed.getUTCMonth() + 1;
    d = parsed.getUTCDate();
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }

  const result = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return isNaN(result.getTime()) ? null : result;
}

export function getDateRangeQuery(daysAhead: number = 30): string {
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + daysAhead);

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  if (today.getMonth() === future.getMonth()) {
    return formatMonth(today);
  } else {
    const startMonth = today.toLocaleDateString("en-US", { month: "long" });
    const endMonthYear = formatMonth(future);
    return `${startMonth}-${endMonthYear}`;
  }
}

export function formatDateForStrapi(date: Date): string {
  return date.toISOString();
}
