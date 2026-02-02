import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database connection (lazy initialization)
 * Using postgres.js driver with Drizzle ORM
 * Note: DATABASE_URL is validated in index.ts via validateEnv()
 */
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export const getDb = () => {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    // Configure connection pool for production
    _client = postgres(process.env.DATABASE_URL, {
      max: 10, // Maximum connections in pool
      idle_timeout: 20, // Close idle connections after 20 seconds
      connect_timeout: 10, // Connection timeout in seconds
      max_lifetime: 60 * 30, // Max connection lifetime: 30 minutes
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
};

// For convenience, export as db (but this will initialize immediately if accessed)
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    return getDb()[prop as keyof PostgresJsDatabase<typeof schema>];
  },
});

/**
 * Check database health by running a simple query
 * Used by health check endpoint
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  error?: string;
}> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return { healthy: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error("[Database] Health check failed:", message);
    return { healthy: false, error: message };
  }
}

/**
 * Close database connections gracefully
 * Called during shutdown
 */
export async function closeDatabase(): Promise<void> {
  if (_client) {
    try {
      await _client.end();
      _client = null;
      _db = null;
      console.log("[Database] Connections closed");
    } catch (error) {
      console.error("[Database] Error closing connections:", error);
    }
  }
}
