import { createAuthClient } from "better-auth/react";
import { env } from "../env";

/**
 * Better Auth client for the frontend
 * Provides type-safe authentication methods
 */
export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
});

// Mock user data for development (matches backend mock-session.ts)
const MOCK_USER = {
  id: "dev-user-00000000-0000-0000-0000-000000000000",
  name: "Dev User",
  email: "dev@localhost",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_SESSION = {
  id: "dev-session-00000000-0000-0000-0000-000000000000",
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  createdAt: new Date(),
  updatedAt: new Date(),
  token: "mock-token",
};

/**
 * Hook to access session data
 * In development with VITE_DEV_MOCK_SESSION=true, returns mock session
 */
export function useSession() {
  const realSession = authClient.useSession();

  // Return mock session in development mode
  if (env.VITE_DEV_MOCK_SESSION && !realSession.data) {
    return {
      ...realSession, // Preserve all original methods including refetch
      data: {
        session: MOCK_SESSION,
        user: MOCK_USER,
      },
      isPending: false,
      error: null,
    };
  }

  return realSession;
}
