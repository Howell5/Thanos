import { z } from "zod";

/**
 * Unified API Response Structure
 *
 * All API endpoints return either:
 * - Success: { success: true, data: T }
 * - Error: { success: false, error: { message, code?, issues? } }
 */

/**
 * API error details
 */
export const apiErrorDetailSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  issues: z.array(z.any()).optional(),
});

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/**
 * Successful API response
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * Failed API response
 */
export interface ApiFailure {
  success: false;
  error: ApiErrorDetail;
}

/**
 * Unified API response type
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Legacy ApiError type (for backward compatibility)
 * @deprecated Use ApiFailure instead
 */
export type ApiError = ApiErrorDetail;

/**
 * Pagination query parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

export type Pagination = z.infer<typeof paginationSchema>;

// =============================================================================
// Error Code Constants
// =============================================================================

/**
 * Standard API error codes
 * Used for consistent error handling across frontend and backend
 */
export const ERROR_CODES = {
  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Validation errors
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",

  // Rate limiting
  RATE_LIMITED: "RATE_LIMITED",

  // Payment/Credits errors (paywall errors - special handling in frontend)
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  LIMIT_REACHED: "LIMIT_REACHED",

  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Error codes that should trigger paywall modal instead of toast
 * These errors indicate the user needs to purchase credits or upgrade
 */
export const PAYWALL_ERROR_CODES: ErrorCode[] = [
  ERROR_CODES.INSUFFICIENT_CREDITS,
  ERROR_CODES.PAYMENT_REQUIRED,
  ERROR_CODES.SUBSCRIPTION_REQUIRED,
  ERROR_CODES.LIMIT_REACHED,
];

/**
 * Check if an error code is a paywall error
 * Paywall errors are handled differently - they show a modal instead of a toast
 */
export function isPaywallError(code: string | undefined): boolean {
  if (!code) return false;
  return PAYWALL_ERROR_CODES.includes(code as ErrorCode);
}
