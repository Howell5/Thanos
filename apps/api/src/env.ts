import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // OAuth providers (optional in development, required in production)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  // Stripe keys are optional in development, required in production
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Development mock session (only works when NODE_ENV=development)
  DEV_MOCK_SESSION: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),
  // Google Cloud / Vertex AI configuration
  // Supports both GOOGLE_VERTEX_PROJECT and GOOGLE_CLOUD_PROJECT
  GOOGLE_VERTEX_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_VERTEX_LOCATION: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().optional(),
  // Cloudflare R2 configuration
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("thanos-medias"),
  R2_CDN_DOMAIN: z.string().default("img.thanos.art"),
  // Volcengine TTS configuration
  VOLCENGINE_TTS_APP_ID: z.string().optional(),
  VOLCENGINE_TTS_ACCESS_TOKEN: z.string().optional(),
  // Kimi K2.5 API (for media description)
  KIMI_API_KEY: z.string().optional(),
  // fal.ai API key (for Seedream v5 image generation)
  FAL_KEY: z.string().optional(),
  // Anthropic API (for Claude Agent SDK)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and returns environment variables
 * Throws an error if validation fails
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  return result.data;
}
