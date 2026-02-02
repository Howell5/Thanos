import type { ApiFailure, ApiSuccess } from "@repo/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Unified API Response Helpers
 *
 * All API endpoints should use these helpers to ensure consistent response format:
 * - Success: { success: true, data: T }
 * - Error: { success: false, error: { message, code?, issues? } }
 */

/**
 * Success response helper
 * Returns: { success: true, data: T }
 */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  const response: ApiSuccess<T> = {
    success: true,
    data,
  };
  return c.json(response, status);
}

/**
 * Error response helper
 * Returns: { success: false, error: { message, code?, issues? } }
 */
export function err(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  code?: string,
  issues?: unknown[],
) {
  const response: ApiFailure = {
    success: false,
    error: {
      message,
      ...(code && { code }),
      ...(issues && { issues }),
    },
  };
  return c.json(response, status);
}

/**
 * Common error shortcuts
 */
export const errors = {
  unauthorized: (c: Context, message = "Unauthorized") => err(c, 401, message, "UNAUTHORIZED"),

  forbidden: (c: Context, message = "Forbidden") => err(c, 403, message, "FORBIDDEN"),

  notFound: (c: Context, message = "Not found") => err(c, 404, message, "NOT_FOUND"),

  badRequest: (c: Context, message: string, issues?: unknown[]) =>
    err(c, 400, message, "BAD_REQUEST", issues),

  conflict: (c: Context, message: string) => err(c, 409, message, "CONFLICT"),

  tooManyRequests: (c: Context, message = "Too many requests") =>
    err(c, 429, message, "RATE_LIMITED"),

  internal: (c: Context, message = "Internal server error") =>
    err(c, 500, message, "INTERNAL_ERROR"),

  serviceUnavailable: (c: Context, message: string) => err(c, 503, message, "SERVICE_UNAVAILABLE"),
};
