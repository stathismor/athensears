import { logger } from "./logger.js";

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    exponentialBase?: number;
    onError?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    exponentialBase = 2,
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
        logger.warn(
          { attempt, maxAttempts, delay, error },
          `Attempt ${attempt}/${maxAttempts} failed. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= exponentialBase;
      } else {
        logger.error(
          { attempt, maxAttempts, error },
          `All ${maxAttempts} attempts failed`
        );
      }
    }
  }

  throw lastError;
}
