import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      // Load from .env file for testing
      DATABASE_URL:
        process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/thanos",
      BETTER_AUTH_SECRET: "test-secret-key-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      NODE_ENV: "test",
    },
  },
});
