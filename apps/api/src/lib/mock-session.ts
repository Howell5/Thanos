/**
 * Mock Session for Development
 * Provides a fake session when DEV_MOCK_SESSION is enabled
 */

import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";
import { validateEnv } from "../env";

// Mock user data for development
const MOCK_USER_ID = "dev-user-00000000-0000-0000-0000-000000000000";
const MOCK_USER = {
  id: MOCK_USER_ID,
  name: "Dev User",
  email: "dev@localhost",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock session data
const MOCK_SESSION = {
  id: "dev-session-00000000-0000-0000-0000-000000000000",
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
  createdAt: new Date(),
  updatedAt: new Date(),
  token: "mock-token",
  ipAddress: "127.0.0.1",
  userAgent: "MockBrowser/1.0",
};

export type SessionData = {
  session: typeof MOCK_SESSION;
  user: typeof MOCK_USER;
};

/**
 * Check if mock session is enabled
 * Only works in development mode
 */
export function isMockSessionEnabled(): boolean {
  const env = validateEnv();
  return env.NODE_ENV === "development" && !!env.DEV_MOCK_SESSION;
}

/**
 * Ensure mock user exists in database
 * Creates the mock user if it doesn't exist
 */
async function ensureMockUser(): Promise<void> {
  // Always check database to handle cases where DB was reset but process wasn't
  const existingUser = await db.query.user.findFirst({
    where: eq(user.id, MOCK_USER_ID),
  });

  if (!existingUser) {
    try {
      await db.insert(user).values({
        id: MOCK_USER_ID,
        name: MOCK_USER.name,
        email: MOCK_USER.email,
        emailVerified: new Date(),
        credits: 10000, // Give dev user plenty of credits
      });
      console.log("🔧 Created mock user for development");
    } catch (error) {
      // Handle race condition where another request created the user
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("duplicate key")) {
        throw error;
      }
    }
  }
}

/**
 * Get session with mock fallback for development
 * In development with DEV_MOCK_SESSION=true, returns mock session when real session is null
 */
export async function getSessionOrMock(c: Context): Promise<SessionData | null> {
  // Try to get real session first
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session) {
    return session as SessionData;
  }

  // Return mock session only in development mode
  if (isMockSessionEnabled()) {
    // Ensure mock user exists in database
    await ensureMockUser();

    return {
      session: MOCK_SESSION,
      user: MOCK_USER,
    };
  }

  return null;
}

/**
 * Get mock user ID for development
 */
export function getMockUserId(): string {
  return MOCK_USER_ID;
}
