import axios from 'axios';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { braveGigSchema } from '../models/braveGig.js';
import { gigSchema, type Gig } from '../models/gig.js';

const BRAVE_AI_URL = 'https://api.search.brave.com/res/v1/chat/completions';

/**
 * Search for Athens music events and extract structured data
 * Uses Brave AI Grounding API to search + extract in one call
 */
export async function searchAndExtractGigs(apiKey: string): Promise<Gig[]> {
  try {
    logger.info('Searching for Athens gigs using Brave AI Grounding API...');

    const currentDate = new Date();
    const nextMonth = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const endDate = nextMonth.toISOString().split('T')[0]; // YYYY-MM-DD

    const prompt = buildExtractionPrompt(today, endDate);

    const response = await axios.post(
      BRAVE_AI_URL,
      {
        model: 'brave',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-subscription-token': apiKey,
        },
        timeout: 120000, // 2 minutes - Brave AI needs time to search + process
      }
    );

    const assistantMessage = response.data.choices?.[0]?.message?.content || '';

    // Log the raw response for debugging
    logger.debug({ assistantMessage }, 'Raw Brave AI response');

    // Parse the AI response to extract structured gig data
    const extractedGigs = parseAIResponse(assistantMessage);

    logger.info({ count: extractedGigs.length }, 'Brave AI search and extraction completed');
    return extractedGigs;
  } catch (error) {
    logger.error({ error }, 'Failed to search and extract gigs with Brave AI');
    throw new Error(
      `Brave AI search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Build the prompt for Brave AI to search and extract gig data
 */
function buildExtractionPrompt(startDate: string, endDate: string): string {
  return `Search the web for upcoming live music events, concerts, and gigs in Athens, Greece from ${startDate} to ${endDate}.

Find 5-10 events and return them as a JSON array with this format:
[
  {
    "title": "Event name",
    "date": "YYYY-MM-DD format",
    "venue": "Venue name and location",
    "price": "Ticket price with € symbol"
  }
]

Requirements:
- Only include confirmed upcoming events starting from ${startDate} onwards
- Events must be in Athens, Greece
- Include: concerts, live music, DJ sets, band performances
- Date format: YYYY-MM-DD (e.g., "2026-02-15")
- Return ONLY the JSON array, no other text

Example: [{"title":"Jazz Night","date":"2026-02-01","venue":"Six Dogs, Monastiraki","price":"€10"}]`;
}

/**
 * Parse AI response and extract structured gig data
 */
function parseAIResponse(content: string): Gig[] {
  try {
    // Remove citations and other XML-like tags from Brave AI response
    let cleanedContent = content
      .replace(/<citation[^>]*>.*?<\/citation>/gs, '')
      .replace(/<enum_item[^>]*>.*?<\/enum_item>/gs, '')
      .replace(/<usage[^>]*>.*?<\/usage>/gs, '')
      .trim();

    // Remove markdown code blocks if present
    cleanedContent = cleanedContent
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Try to find JSON array in the response
    let jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);

    // If no closing bracket found, but we have an opening bracket, try to fix it
    if (!jsonMatch && cleanedContent.includes('[')) {
      logger.warn('JSON array appears incomplete, attempting to fix');
      cleanedContent = cleanedContent + ']';
      jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
    }

    if (!jsonMatch) {
      logger.warn({ content: cleanedContent.substring(0, 500) }, 'No JSON array found in AI response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      logger.warn('AI response is not an array');
      return [];
    }

    // Validate and transform Brave AI responses using Zod
    const validGigs: Gig[] = [];

    for (const item of parsed) {
      try {
        // First validate the Brave AI response format
        const braveGig = braveGigSchema.parse(item);

        // Transform to our Gig format
        const transformed = transformBraveGigFormat(braveGig);

        // Validate the transformed data
        const validated = gigSchema.parse(transformed);

        validGigs.push(validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.warn(
            { item, errors: error.issues },
            'Invalid gig data - validation failed'
          );
        } else {
          logger.warn({ item, error }, 'Failed to process gig data');
        }
      }
    }

    return validGigs;
  } catch (error) {
    logger.error({ error, contentPreview: content.substring(0, 500) }, 'Failed to parse AI response');
    return [];
  }
}

/**
 * Transform Brave AI's natural format to our schema format
 * Brave returns: {title, date, venue: "string", price}
 * We need: {title, date, venue: {name, address, ...}, price, time_display}
 */
function transformBraveGigFormat(braveGig: z.infer<typeof braveGigSchema>): Omit<Gig, 'time_display'> & { time_display?: string } {
  // Parse date and add time if needed
  let date = braveGig.date;
  if (date && !date.includes('T')) {
    // If only date provided (YYYY-MM-DD), add default time
    date = `${date}T21:00:00Z`;
  }

  // Handle venue - can be string or object
  const venueData =
    typeof braveGig.venue === 'string'
      ? { name: braveGig.venue }
      : {
          name: braveGig.venue.name,
          address: braveGig.venue.address,
          website: braveGig.venue.website,
          neighborhood: braveGig.venue.neighborhood,
        };

  return {
    title: braveGig.title,
    date: date,
    time_display: braveGig.time_display || '21:00',
    price: braveGig.price,
    description: braveGig.description || `Live music event at ${venueData.name}`,
    venue: venueData,
  };
}
