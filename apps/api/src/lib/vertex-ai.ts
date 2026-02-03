/**
 * Vertex AI Image Generation Service
 * Uses Vercel AI SDK with Google Vertex AI provider
 */

import { vertex } from "@ai-sdk/google-vertex";
import { generateImage } from "ai";
import { validateEnv } from "../env";

export interface GenerateImageParams {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
}

export interface GenerateImageResult {
  imageData: Buffer;
  width: number;
  height: number;
  mimeType: string;
  durationMs: number;
}

// Aspect ratio to dimensions mapping (approximate for output)
const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1792, height: 1024 },
  "9:16": { width: 1024, height: 1792 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
};

/**
 * Generate an image using Vertex AI Imagen
 */
export async function generateAIImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  if (!isVertexAIConfigured()) {
    throw new Error(
      "Vertex AI not configured. Please set GOOGLE_CLOUD_PROJECT environment variable.",
    );
  }

  const startTime = Date.now();
  const model = params.model || "imagen-3.0-generate-001";
  const aspectRatio = (params.aspectRatio || "1:1") as "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS["1:1"];

  const result = await generateImage({
    model: vertex.image(model),
    prompt: params.prompt,
    aspectRatio,
    providerOptions: params.negativePrompt
      ? {
          vertex: {
            negativePrompt: params.negativePrompt,
          },
        }
      : undefined,
  });

  // Convert base64 to Buffer
  const base64Data = result.image.base64;
  const imageData = Buffer.from(base64Data, "base64");

  return {
    imageData,
    width: dimensions.width,
    height: dimensions.height,
    mimeType: "image/png",
    durationMs: Date.now() - startTime,
  };
}

/**
 * Estimate credits for an image generation
 * Currently simple: 1 credit per image
 * TODO: Implement token-based pricing
 */
export function estimateCredits(params: GenerateImageParams): number {
  // For now, use a simple flat rate
  // Can be expanded to consider model, size, etc.
  const model = params.model || "imagen-3.0-generate-001";

  // Different models might have different costs
  if (model.includes("fast")) {
    return 50; // Faster model, lower cost
  }

  return 100; // Default cost
}

/**
 * Check if Vertex AI is configured and available
 */
export function isVertexAIConfigured(): boolean {
  const env = validateEnv();
  return !!env.GOOGLE_CLOUD_PROJECT;
}
