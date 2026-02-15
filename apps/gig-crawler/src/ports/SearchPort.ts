import type { SearchResult } from "../models/searchResult.js";

export interface SearchOptions {
  country?: string;
  searchLang?: string;
  extraSnippets?: boolean;
}

export interface SearchPort {
  search(query: string, count?: number, options?: SearchOptions): Promise<SearchResult[]>;
}
