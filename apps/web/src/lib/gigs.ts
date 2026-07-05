export interface Venue {
  id: number;
  name: string;
  address?: string;
  website?: string;
  neighborhood?: string;
}

export interface Gig {
  id: number;
  title: string;
  date: string;
  time_display?: string;
  price?: string;
  description?: string;
  url?: string;
  genre?: string;
  venue?: Venue;
}

export interface StrapiResponse {
  data: Gig[];
}

/**
 * Fetch upcoming gigs from Strapi, retrying a few times on failure.
 *
 * The CMS can be briefly unreachable even when healthy - a redeploy, or a
 * cold/waking service returning a 502 - where the very next request succeeds
 * (the classic "works on refresh"). Retrying with a short backoff turns that
 * transient blip into a slightly slower first load instead of an error page.
 * Each attempt is bounded by a timeout so a genuine hang can't stall the request.
 */
export async function fetchGigs(
  strapiUrl: string,
  { attempts = 3, timeoutMs = 6000 }: { attempts?: number; timeoutMs?: number } = {}
): Promise<Gig[]> {
  const today = new Date().toISOString().split('T')[0];
  const url = `${strapiUrl}/api/gigs?populate=venue&sort=date:asc&filters[date][$gte]=${today}&pagination[limit]=300`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: StrapiResponse = await response.json();
      return data.data;
    } catch (error) {
      lastError = error;
      // Backoff before the next try (300ms, 600ms, …); no wait after the last.
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** Year-month key (e.g. "2026-07") used to detect when the month changes in a sorted list. */
export function monthKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Full month name (e.g. "July") for section dividers. */
export function getMonthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'long' });
}

/** The stacked date block: short weekday, day number, short month (e.g. FRI / 30 / MAY). */
export function formatDate(dateStr: string): { weekday: string; day: string; month: string } {
  const date = new Date(dateStr);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: String(date.getDate()),
    month: date.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

// Greek maps the tonos (´) onto accented vowels; the uppercase convention drops
// it (Κέντρο → ΚΕΝΤΡΟ). Map each accented vowel to its plain form - dialytika
// (ϊ ϋ) is preserved, and Latin accents are left untouched.
const GREEK_TONOS: Record<string, string> = {
  ά: 'α',
  έ: 'ε',
  ή: 'η',
  ί: 'ι',
  ό: 'ο',
  ύ: 'υ',
  ώ: 'ω',
  ΐ: 'ϊ',
  ΰ: 'ϋ',
  Ά: 'Α',
  Έ: 'Ε',
  Ή: 'Η',
  Ί: 'Ι',
  Ό: 'Ο',
  Ύ: 'Υ',
  Ώ: 'Ω',
};

export function stripGreekAccents(text: string): string {
  return text.replace(/[άέήίόύώΐΰΆΈΉΊΌΎΏ]/g, (c) => GREEK_TONOS[c]);
}
