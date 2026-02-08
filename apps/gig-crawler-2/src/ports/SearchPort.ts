import type { SearchResult } from "../models/searchResult.js";

export interface SearchPort {
  search(query: string, count?: number): Promise<SearchResult[]>;
}
