import type { SearchPort } from '../../ports/SearchPort.js';
import { searchAndExtractGigs as searchAndExtractGigsImpl } from './searchAndExtractGigs.js';

/**
 * Brave AI implementation of SearchPort
 * Searches the web for Athens gigs and extracts structured data
 */
export function createBraveSearchRepo(apiKey: string): SearchPort {
  return {
    searchAndExtractGigs: () => searchAndExtractGigsImpl(apiKey),
  };
}
