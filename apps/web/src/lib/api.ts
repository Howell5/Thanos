import { hcWithType } from "@repo/api/client";
import { type ApiFailure, type ApiSuccess, isPaywallError } from "@repo/shared";
import { toast } from "sonner";
import { env } from "../env";

/**
 * Custom API error with error code support
 * Allows frontend to handle different error types appropriately
 */
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/**
 * Custom fetch wrapper that throws on non-2xx responses
 * By default, fetch doesn't throw on HTTP errors (4xx, 5xx)
 *
 * Features:
 * - Automatically shows toast for non-paywall errors
 * - Preserves error codes for special handling
 * - Throws ApiError with code for programmatic handling
 */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: "include", // Important: allows cookies for Better Auth
  });

  if (!response.ok) {
    // Clone response to preserve the body for hono client to read
    const clonedResponse = response.clone();
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorCode: string | undefined;

    try {
      const errorData = (await clonedResponse.json()) as ApiFailure;
      errorMessage = errorData.error?.message || errorMessage;
      errorCode = errorData.error?.code;
    } catch {
      // If parsing fails, use default message
    }

    // Show toast for non-paywall errors (paywall errors are handled by PaywallModal)
    if (!isPaywallError(errorCode)) {
      toast.error(errorMessage);
    }

    throw new ApiError(errorMessage, errorCode);
  }

  return response;
}

/**
 * Pre-compiled Hono RPC client with custom fetch wrapper
 * Uses hcWithType for better IDE performance - types are pre-computed at build time
 */
export const api = hcWithType(env.VITE_API_URL, {
  fetch: apiFetch,
});

/**
 * Helper type to extract the data type from an ApiSuccess response.
 * Since our API always returns { success: true, data: T } for success responses,
 * this extracts T from ApiSuccess<T>.
 */
export type ExtractData<T> = T extends ApiSuccess<infer D> ? D : never;

/**
 * Helper function to unwrap API response and extract data.
 * Since apiFetch throws on errors, we can safely assume success responses.
 * This provides runtime unwrapping with type inference.
 */
export async function unwrap<T extends ApiSuccess<unknown>>(
  responsePromise: Promise<Response>,
): Promise<ExtractData<T>> {
  const response = await responsePromise;
  const json = (await response.json()) as T;
  if (!json.success) {
    throw new Error((json as unknown as ApiFailure).error?.message || "Unknown error");
  }
  return json.data as ExtractData<T>;
}
