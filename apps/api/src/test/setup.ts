/**
 * Test Setup
 * Initializes test environment and provides utilities for database cleanup
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { closeDatabase, getDb } from "../db";
import { resetDefaultServices } from "../middleware/services";

// Tables that need cleanup between tests (in order to respect foreign keys)
const CLEANUP_TABLES = [
  "ai_usage_history",
  "ai_images",
  "orders",
  "posts",
  "projects",
  "session",
  "account",
  "verification",
  "user",
] as const;

/**
 * Clean up all test data from the database
 */
export async function cleanupDatabase(): Promise<void> {
  const db = getDb();

  for (const table of CLEANUP_TABLES) {
    await db.execute(sql.raw(`DELETE FROM "${table}"`));
  }
}

/**
 * Create a test user and return their ID
 */
export async function createTestUser(overrides?: {
  id?: string;
  name?: string;
  email?: string;
  credits?: number;
}): Promise<{ id: string; name: string; email: string; credits: number }> {
  const db = getDb();
  const id = overrides?.id ?? `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const name = overrides?.name ?? "Test User";
  const email = overrides?.email ?? `test-${id}@example.com`;
  const credits = overrides?.credits ?? 1000;

  await db.execute(sql`
    INSERT INTO "user" (id, name, email, credits, created_at, updated_at)
    VALUES (${id}, ${name}, ${email}, ${credits}, NOW(), NOW())
  `);

  return { id, name, email, credits };
}

/**
 * Create a test project and return its ID
 */
export async function createTestProject(
  userId: string,
  overrides?: {
    id?: string;
    name?: string;
    description?: string;
    isPublic?: boolean;
  },
): Promise<{ id: string; name: string; userId: string }> {
  const db = getDb();
  const name = overrides?.name ?? "Test Project";
  const description = overrides?.description ?? "Test project description";
  const isPublic = overrides?.isPublic ?? false;

  const result = await db.execute(sql`
    INSERT INTO "projects" (user_id, name, description, is_public, canvas_data, created_at, updated_at)
    VALUES (${userId}, ${name}, ${description}, ${isPublic}, '[]', NOW(), NOW())
    RETURNING id
  `);

  const id = (result as unknown as { id: string }[])[0]?.id;
  if (!id) {
    throw new Error("Failed to create test project");
  }

  return { id, name, userId };
}

/**
 * Create a test session for authentication
 */
export async function createTestSession(
  userId: string,
): Promise<{ id: string; token: string; userId: string }> {
  const db = getDb();
  const id = `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const token = `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

  await db.execute(sql`
    INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at)
    VALUES (${id}, ${userId}, ${token}, ${expiresAt}, NOW(), NOW())
  `);

  return { id, token, userId };
}

// Global test setup
beforeAll(async () => {
  // Ensure database connection is established
  getDb();
});

beforeEach(async () => {
  // Clean up database before each test
  await cleanupDatabase();
  // Reset service singletons
  resetDefaultServices();
});

afterAll(async () => {
  // Clean up and close database
  await cleanupDatabase();
  await closeDatabase();
});
