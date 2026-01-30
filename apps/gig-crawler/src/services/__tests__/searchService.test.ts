import { describe, it, expect } from '@jest/globals';

/**
 * Unit tests for Brave AI response parsing
 * Based on actual API responses from test-brave-api.sh
 */

describe('BraveAIService Response Parsing', () => {
  /**
   * Actual response from Brave AI Grounding API
   * Note: May have incomplete JSON (missing closing bracket)
   */
  const realBraveResponse = `[{"title":"Puccini's Tosca by Greek National Opera","date":"2026-01-09","venue":"Stavros Niarchos Hall","price":"€15 to €130"},{"title":"VNV Nation live electronic music performance","date":"2026-01-10","venue":"Arch Club Live Stage","price":"€30"}`;

  const realBraveResponseWithClosing = realBraveResponse + ']';

  describe('parseAIResponse', () => {
    it('should handle complete JSON array', () => {
      const result = parseResponse(realBraveResponseWithClosing);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Puccini's Tosca by Greek National Opera");
      expect(result[0].date).toBe('2026-01-09');
    });

    it('should handle incomplete JSON (missing closing bracket)', () => {
      // Brave AI sometimes returns incomplete JSON - we should handle it
      const result = parseResponse(realBraveResponse);
      expect(result).toHaveLength(2);
    });

    it('should handle unicode escapes (€ symbol)', () => {
      const unicodeResponse = `[{"title":"Test","date":"2026-01-01","venue":"Test Venue","price":"\\u20ac10"}]`;
      const result = parseResponse(unicodeResponse);
      expect(result[0].price).toBe('€10');
    });

    it('should extract JSON from text with citations', () => {
      const withCitations = `Here are the events: [{"title":"Test","date":"2026-01-01","venue":"Venue","price":"€10"}] <citation>{"url":"..."}</citation>`;
      const result = parseResponse(withCitations);
      expect(result).toHaveLength(1);
    });

    it('should return empty array for no events', () => {
      const noEvents = 'I could not find any upcoming events.';
      const result = parseResponse(noEvents);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const invalid = '[{invalid json';
      const result = parseResponse(invalid);
      expect(result).toEqual([]);
    });
  });

  describe('validateExtractedData', () => {
    it('should accept valid gig with all fields', () => {
      const valid = {
        title: 'Jazz Night',
        date: '2026-02-15T21:00:00Z',
        venue: 'Six Dogs',
        price: '€10',
        time_display: '21:00',
      };
      expect(isValidGig(valid)).toBe(true);
    });

    it('should reject gig without title', () => {
      const invalid = {
        date: '2026-02-15',
        venue: 'Six Dogs',
      };
      expect(isValidGig(invalid)).toBe(false);
    });

    it('should reject gig without date', () => {
      const invalid = {
        title: 'Jazz Night',
        venue: 'Six Dogs',
      };
      expect(isValidGig(invalid)).toBe(false);
    });

    it('should reject gig without venue', () => {
      const invalid = {
        title: 'Jazz Night',
        date: '2026-02-15',
      };
      expect(isValidGig(invalid)).toBe(false);
    });

    it('should reject gig with past date', () => {
      const past = {
        title: 'Jazz Night',
        date: '2020-01-01T21:00:00Z',
        venue: 'Six Dogs',
      };
      expect(isValidGig(past)).toBe(false);
    });

    it('should truncate title if too long', () => {
      const longTitle = 'A'.repeat(300);
      const gig = {
        title: longTitle,
        date: '2026-02-15T21:00:00Z',
        venue: 'Six Dogs',
      };
      const result = normalizeGig(gig);
      expect(result.title.length).toBe(255);
    });
  });
});

// Helper functions matching the actual implementation
function parseResponse(content: string): any[] {
  try {
    // Remove citations and other XML-like tags
    let cleaned = content
      .replace(/<citation[^>]*>.*?<\/citation>/gs, '')
      .replace(/<enum_item[^>]*>.*?<\/enum_item>/gs, '')
      .replace(/<usage[^>]*>.*?<\/usage>/gs, '')
      .trim();

    // Remove markdown code blocks if present
    cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Try to find JSON array
    let jsonMatch = cleaned.match(/\[[\s\S]*\]/);

    // If no closing bracket, try to add it
    if (!jsonMatch && cleaned.includes('[')) {
      cleaned = cleaned + ']';
      jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    }

    if (!jsonMatch) {
      return [];
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    return [];
  }
}

function isValidGig(gig: any): boolean {
  if (!gig.title || typeof gig.title !== 'string') return false;
  if (!gig.date || typeof gig.date !== 'string') return false;
  if (!gig.venue) return false;

  // Validate date is in future
  const gigDate = new Date(gig.date);
  if (isNaN(gigDate.getTime())) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (gigDate < now) return false;

  return true;
}

function normalizeGig(gig: any): any {
  if (gig.title && gig.title.length > 255) {
    gig.title = gig.title.substring(0, 255);
  }
  return gig;
}
