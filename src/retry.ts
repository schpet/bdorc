/**
 * Retry utilities for handling transient Claude failures
 */

/**
 * Patterns that indicate a transient/retryable error from Claude.
 * These are typically crashes, network issues, or service problems
 * rather than legitimate task failures.
 */
const TRANSIENT_ERROR_PATTERNS = [
  // JSON parsing errors (Claude crashed mid-output)
  /SyntaxError:.*JSON/i,
  /Unexpected.*JSON/i,
  /Unexpected token/i,
  /Unexpected end of/i,

  // Network errors
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /socket hang up/i,
  /NetworkError/i,
  /Failed to fetch/i,
  /request to.*failed/i,

  // Rate limits and overload
  /rate limit/i,
  /429/,
  /too many requests/i,
  /overload/i,
  /503/,
  /service unavailable/i,

  // Internal errors
  /internal_error/i,
  /InternalError/i,
  /500.*Internal/i,
];

/**
 * Check if an error from Claude is likely transient and worth retrying.
 * Returns true for crashes, network issues, rate limits, etc.
 * Returns false for permission errors, auth issues, or task failures.
 */
export function isTransientClaudeError(error: string): boolean {
  if (!error || error.trim() === "") {
    return false;
  }

  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(error));
}

/**
 * Calculate delay for exponential backoff
 * @param attempt - The retry attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default 1000)
 * @param maxDelayMs - Maximum delay cap (default 30000)
 */
export function getRetryDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at maxDelayMs
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = Math.random() * delay * 0.25;
  return Math.floor(delay + jitter);
}
