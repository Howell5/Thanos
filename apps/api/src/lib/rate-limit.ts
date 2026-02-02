/**
 * Simple in-memory rate limiter
 * Uses sliding window algorithm for accurate rate limiting
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// In-memory store for rate limit data
const store = new Map<string, RateLimitEntry>();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Start cleanup timer
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    // Remove entries with no recent timestamps
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 60000) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Check if a request should be rate limited
 * @param key Unique identifier (e.g., IP + userId)
 * @param config Rate limit configuration
 * @returns Object with limited status and remaining requests
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { limited: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if limit exceeded
  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const resetMs = oldestInWindow + config.windowMs - now;
    return {
      limited: true,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  // Add current timestamp
  entry.timestamps.push(now);

  return {
    limited: false,
    remaining: config.maxRequests - entry.timestamps.length,
    resetMs: config.windowMs,
  };
}

// =============================================================================
// Common Rate Limit Configurations
// =============================================================================

/**
 * API rate limit per user
 * 100 requests per minute
 */
export const API_USER_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

/**
 * Stricter global rate limit per IP
 * 200 requests per IP per minute
 */
export const GLOBAL_IP_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 200,
};

/**
 * Checkout rate limit per user
 * 5 checkout attempts per hour
 */
export const CHECKOUT_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
};

/**
 * Webhook rate limit per IP
 * 100 requests per minute (Stripe sends multiple events)
 */
export const WEBHOOK_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

// =============================================================================
// Rate Limit Key Generators
// =============================================================================

/**
 * Generate rate limit key for API requests by user
 */
export function getApiUserRateLimitKey(userId: string): string {
  return `api:user:${userId}`;
}

/**
 * Generate global IP rate limit key
 */
export function getGlobalIpRateLimitKey(ip: string): string {
  return `global:${ip}`;
}

/**
 * Generate rate limit key for checkout
 */
export function getCheckoutRateLimitKey(userId: string): string {
  return `checkout:${userId}`;
}

/**
 * Generate rate limit key for webhooks
 */
export function getWebhookRateLimitKey(ip: string): string {
  return `webhook:${ip}`;
}

// =============================================================================
// IP Address Utilities
// =============================================================================

/**
 * Get real client IP from request headers
 *
 * Priority order (most trusted first):
 * 1. CF-Connecting-IP (Cloudflare - most reliable when behind Cloudflare)
 * 2. X-Real-IP (commonly set by reverse proxies)
 * 3. First IP in X-Forwarded-For (can be spoofed if not behind trusted proxy)
 *
 * Note: This function assumes the service is behind Cloudflare or a trusted proxy.
 */
export function getClientIp(headers: Headers): string {
  // Cloudflare always sets this to the real client IP
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }

  // Zeabur/other platforms may set X-Real-IP
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Fall back to X-Forwarded-For (first IP only)
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0];
    return firstIp.trim();
  }

  return "unknown";
}
