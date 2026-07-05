import { logger } from "./logger.js";

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED")) {
      return true;
    }
  }
  if (typeof error === "object" && error !== null && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/** Pull an HTTP status off an axios error (`response.status`) or a Gemini/fetch error (`status`). */
function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const e = error as { status?: number; response?: { status?: number } };
    if (typeof e.status === "number") {
      return e.status;
    }
    if (typeof e.response?.status === "number") {
      return e.response.status;
    }
  }
  return undefined;
}

/**
 * A 4xx other than 429 (bad request, auth, permissions, not-found) won't succeed
 * on retry, so retrying just burns the backoff budget before the inevitable failure.
 * Retry only rate limits and transient errors (5xx, network, unknown).
 */
function isRetryable(error: unknown): boolean {
  if (isRateLimitError(error)) {
    return true;
  }
  const status = getErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }
  return true;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    exponentialBase?: number;
    rateLimitDelay?: number;
    onError?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    exponentialBase = 2,
    rateLimitDelay = 10000,
    onError,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (onError) {
        onError(error, attempt);
      }

      // Fail fast on non-retryable errors (4xx other than 429) - retrying can't help.
      if (!isRetryable(error)) {
        logger.error({ attempt, error }, "Non-retryable error, aborting retries");
        throw error;
      }

      if (attempt < maxAttempts) {
        const actualDelay = isRateLimitError(error) ? Math.max(delay, rateLimitDelay) : delay;

        logger.warn(
          { attempt, maxAttempts, delay: actualDelay, rateLimited: isRateLimitError(error), error },
          `Attempt ${attempt}/${maxAttempts} failed. Retrying in ${actualDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, actualDelay));
        delay *= exponentialBase;
      } else {
        logger.error({ attempt, maxAttempts, error }, `All ${maxAttempts} attempts failed`);
      }
    }
  }

  throw lastError;
}
