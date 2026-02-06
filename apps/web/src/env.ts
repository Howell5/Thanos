import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url().default("http://localhost:7770"),
  // Development mock session (set to "true" to enable)
  VITE_DEV_MOCK_SESSION: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .optional()
    .default("false"),
});

export type ClientEnv = z.infer<typeof envSchema>;

/**
 * Validates and returns environment variables for the frontend
 * Vite exposes env vars through import.meta.env
 */
function validateEnv(): ClientEnv {
  const result = envSchema.safeParse(import.meta.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  return result.data;
}

export const env = validateEnv();
