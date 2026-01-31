import axios from 'axios';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../../utils/logger.js';
import { braveGigSchema } from '../../models/braveGig.js';
import { gigSchema, type Gig } from '../../models/gig.js';

const BRAVE_AI_URL = 'https://api.search.brave.com/res/v1/chat/completions';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build the prompt for Brave AI by reading from markdown file
 */
function buildExtractionPrompt(startDate: string, endDate: string): string {
  const promptPath = join(__dirname, '../../prompts/gig-extraction.md');
  const promptTemplate = readFileSync(promptPath, 'utf-8');

  // Extract the actual prompt content (between ## Prompt and ## Requirements)
  const promptMatch = promptTemplate.match(/## Prompt\n\n([\s\S]*?)\n\n## Requirements/);
  const requirementsMatch = promptTemplate.match(/## Requirements\n\n([\s\S]*?)\n\n## Example/);
  const exampleMatch = promptTemplate.match(/## Example Output\n\n```json\n([\s\S]*?)\n```/);

  if (!promptMatch || !requirementsMatch) {
    throw new Error('Failed to parse prompt template');
  }

  const prompt = promptMatch[1]
    .replace(/{{startDate}}/g, startDate)
    .replace(/{{endDate}}/g, endDate);

  const requirements = requirementsMatch[1]
    .replace(/{{startDate}}/g, startDate);

  const example = exampleMatch ? `\n\nExample: ${exampleMatch[1]}` : '';

  return `${prompt}\n\n${requirements}${example}`;
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
function transformBraveGigFormat(
  braveGig: z.infer<typeof braveGigSchema>
): Omit<Gig, 'time_display'> & { time_display?: string } {
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
