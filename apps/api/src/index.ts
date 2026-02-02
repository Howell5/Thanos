import path from "node:path";
import { fileURLToPath } from "node:url";
// IMPORTANT: Load environment variables FIRST, before any other imports
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from apps/api directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Configure HTTP proxy for Node.js fetch (useful for local development)
// Supports: HTTPS_PROXY, https_proxy, HTTP_PROXY, http_proxy, ALL_PROXY, all_proxy
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.ALL_PROXY ||
  process.env.all_proxy;

if (proxyUrl) {
  // Dynamic import to avoid issues if undici is not available
  import("undici")
    .then(({ ProxyAgent, setGlobalDispatcher }) => {
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
      console.log(`[Proxy] HTTP proxy configured: ${proxyUrl}`);
    })
    .catch(() => {
      console.warn("[Proxy] Failed to configure proxy: undici not available");
    });
}

// Now import other modules
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { checkDatabaseHealth, closeDatabase } from "./db";
import { validateEnv } from "./env";
import checkoutRoute from "./routes/checkout";
import ordersRoute from "./routes/orders";
import postsRoute from "./routes/posts";
import userRoute from "./routes/user";
import webhooksRoute from "./routes/webhooks";

const env = validateEnv();

// CORS configuration - supports both development and production
const getAllowedOrigins = () => {
  if (env.NODE_ENV === "production") {
    // Production: only allow configured frontend URL
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      console.warn("⚠️  FRONTEND_URL not set in production, CORS may block requests");
      return [];
    }
    return [frontendUrl];
  }
  // Development: allow local Vite dev server
  return ["http://localhost:5173", "http://localhost:5174"];
};

/**
 * Base Hono app with middleware
 * We use a separate base app for middleware that doesn't need type inference
 */
const baseApp = new Hono();

// Global error handler - catches unhandled errors to prevent crashes
baseApp.onError((err, c) => {
  console.error("[Error] Unhandled error:", err.message, err.stack);
  return c.json(
    {
      success: false,
      error: {
        message: env.NODE_ENV === "production" ? "Internal server error" : err.message,
        code: "INTERNAL_ERROR",
      },
    },
    500,
  );
});

baseApp.use("*", logger());
baseApp.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return origin;

      const allowedOrigins = getAllowedOrigins();
      // Return the origin if it's allowed, otherwise return null
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
  }),
);

// Mount Better Auth routes (doesn't need RPC type inference)
// Using wildcard pattern per Better Auth docs: https://www.better-auth.com/docs/integrations/hono
baseApp.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

/**
 * Main Hono application with chained routes for RPC type inference
 * IMPORTANT: Use chained .route() calls to preserve type information
 */
// Track server shutdown state for health checks
let isShuttingDown = false;

const app = baseApp
  .get("/", (c) => {
    return c.json({
      message: "Morph Template API",
      version: "1.0.0",
    });
  })
  // Health check endpoint for Zeabur and monitoring
  // Minimal info exposed - just status for load balancer decisions
  .get("/health", async (c) => {
    if (isShuttingDown) {
      return c.json({ status: "shutting_down" }, 503);
    }

    const dbHealth = await checkDatabaseHealth();
    return c.json({ status: dbHealth.healthy ? "ok" : "degraded" }, dbHealth.healthy ? 200 : 503);
  })
  .route("/api/posts", postsRoute)
  .route("/api/checkout", checkoutRoute)
  .route("/api/orders", ordersRoute)
  .route("/api/webhooks", webhooksRoute)
  .route("/api/user", userRoute);

/**
 * Export the app type for frontend type inference
 * This is the key to end-to-end type safety
 */
export type AppType = typeof app;

// Start server
let server: ServerType | null = null;

if (process.env.NODE_ENV !== "test") {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  server = serve({
    fetch: app.fetch,
    port: env.PORT,
  });
}

/**
 * Graceful shutdown handler
 * Ensures in-flight requests complete and resources are cleaned up
 */
async function gracefulShutdown(signal: string) {
  console.log(`\n[Shutdown] ${signal} received, starting graceful shutdown...`);
  isShuttingDown = true;

  // Give load balancer time to stop sending traffic (health check returns 503)
  const drainDelay = 5000;
  console.log(`[Shutdown] Waiting ${drainDelay}ms for traffic to drain...`);
  await new Promise((resolve) => setTimeout(resolve, drainDelay));

  // Close HTTP server (stop accepting new connections)
  if (server) {
    console.log("[Shutdown] Closing HTTP server...");
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => {
        if (err) {
          console.error("[Shutdown] Error closing server:", err);
          reject(err);
        } else {
          console.log("[Shutdown] HTTP server closed");
          resolve();
        }
      });
    });
  }

  // Close database connections
  console.log("[Shutdown] Closing database connections...");
  await closeDatabase();
  console.log("[Shutdown] Database connections closed");

  console.log("[Shutdown] Graceful shutdown complete");
  process.exit(0);
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Fatal] Unhandled rejection at:", promise, "reason:", reason);
  // Don't exit on unhandled rejection, just log it
  // This prevents the server from crashing on recoverable errors
});

export default app;
