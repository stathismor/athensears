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
