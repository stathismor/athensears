import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: boolean;
  retryOn?: (error: any) => boolean;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = true,
    retryOn = isTransientError,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !retryOn(error)) {
        throw error;
      }

      const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;

      logger.warn(
        {
          attempt,
          maxAttempts,
          delay,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Retrying after error'
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is transient (network, timeout, rate limit)
 */
function isTransientError(error: any): boolean {
  if (!error) return false;

  // Axios errors
  if (error.isAxiosError) {
    const status = error.response?.status;

    // Retry on network errors, timeouts, and specific HTTP status codes
    if (!status) return true; // Network error
    if (status === 429) return true; // Rate limit
    if (status >= 500) return true; // Server errors
    if (status === 408) return true; // Request timeout

    return false;
  }

  // Generic network errors
  const errorMessage = error.message?.toLowerCase() || '';
  if (errorMessage.includes('timeout')) return true;
  if (errorMessage.includes('econnreset')) return true;
  if (errorMessage.includes('enotfound')) return true;
  if (errorMessage.includes('network')) return true;

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
