/**
 * Sync operation result
 */
export interface SyncResult {
  status: 'in_progress' | 'completed' | 'failed';
  summary: {
    gigsFound: number;
    gigsCreated: number;
    gigsDuplicate: number;
    gigsSkipped: number;
    venuesCreated: number;
    errors: string[];
  };
  executionTime?: string;
}

/**
 * Strapi API response wrapper
 */
export interface StrapiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

/**
 * Strapi v5 entity - fields are flat, not nested under attributes
 */
export type StrapiEntity<T> = T & {
  id: number;
  documentId: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
};
