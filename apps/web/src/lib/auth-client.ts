import { createAuthClient } from "better-auth/react";
import { env } from "../env";

/**
 * Better Auth client for the frontend
 * Provides type-safe authentication methods
 */
export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
});

/**
 * Hook to access session data
 * Extracted from authClient
 */
export const useSession = authClient.useSession;
