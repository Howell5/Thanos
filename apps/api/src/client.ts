/**
 * Pre-compiled Hono RPC Client
 *
 * This file pre-computes the client type at compile time, which significantly
 * improves IDE performance. Instead of tsserver having to instantiate the
 * full type every time, the type is calculated once during build.
 *
 * Usage in frontend:
 *   import { hcWithType, type ApiClient } from "@repo/api/client";
 *   const api = hcWithType("http://localhost:3000", { fetch: customFetch });
 */

import { hc } from "hono/client";
import type app from "./index";

/**
 * Pre-compiled API client type
 * This type is calculated at compile time, not runtime
 */
export type ApiClient = ReturnType<typeof hc<typeof app>>;

/**
 * Type-safe Hono client factory with pre-computed types
 * Use this instead of hc<AppType>() for better IDE performance
 */
export const hcWithType = (...args: Parameters<typeof hc>): ApiClient => hc<typeof app>(...args);
