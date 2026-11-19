/**
 * Canonical API error codes.
 *
 * These codes are part of the public API contract — they appear in every
 * error envelope as `{ success: false, error: { code, message } }`.
 * The frontend maps these codes to localised UI strings via i18next.
 *
 * When adding a new code:
 *  1. Add it here first.
 *  2. Use the constant in your service — never inline a raw string.
 *  3. Add the corresponding translation keys to all 6 locale files in apps/web.
 */
export const ErrorCode = {
  // Generic
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // Crisis domain
  CRISIS_NOT_FOUND: "CRISIS_NOT_FOUND",
  CRISIS_NOT_ACTIVE: "CRISIS_NOT_ACTIVE",

  // Report domain
  REPORT_NOT_FOUND: "REPORT_NOT_FOUND",

  // Auth / access
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Rate limiting / abuse
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  DUPLICATE_REPORT: "DUPLICATE_REPORT",

  // Generic not found
  NOT_FOUND: "NOT_FOUND",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
