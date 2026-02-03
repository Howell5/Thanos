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
  // Reference images for image-to-image generation (base64 strings)
  referenceImages?: string[];
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
 * Strip base64 data URL prefix if present
 * Converts "data:image/png;base64,..." to just the base64 content
 */
function stripBase64Prefix(base64: string): string {
  const match = base64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64;
}

/**
 * Generate an image using Vertex AI Imagen
 * Supports both text-to-image and image-to-image (with reference images)
 */
export async function generateAIImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  if (!isVertexAIConfigured()) {
    throw new Error(
      "Vertex AI not configured. Please set GOOGLE_CLOUD_PROJECT environment variable.",
    );
  }

  const startTime = Date.now();
  const hasReferenceImages = params.referenceImages && params.referenceImages.length > 0;

  // Use capability model for image-to-image, otherwise use specified model
  const model = hasReferenceImages
    ? "imagen-3.0-capability-001"
    : params.model || "imagen-3.0-generate-001";

  const aspectRatio = (params.aspectRatio || "1:1") as "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS["1:1"];

  // Build provider options
  const providerOptions = params.negativePrompt
    ? {
        vertex: {
          negativePrompt: params.negativePrompt,
        },
      }
    : undefined;

  // Build prompt - either string or object with images
  let prompt: string | { text: string; images: Buffer[] };

  if (hasReferenceImages) {
    // Convert base64 strings to Buffers for image-to-image
    const imageBuffers = params.referenceImages!.map((base64) => {
      const cleanBase64 = stripBase64Prefix(base64);
      return Buffer.from(cleanBase64, "base64");
    });

    prompt = {
      text: params.prompt,
      images: imageBuffers,
    };
  } else {
    prompt = params.prompt;
  }

  const result = await generateImage({
    model: vertex.image(model),
    prompt,
    aspectRatio,
    providerOptions,
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
 * Inpainting parameters
 */
export interface InpaintImageParams {
  prompt: string;
  imageData: string; // base64 string
  maskData: string; // base64 string - white pixels indicate areas to regenerate
}

/**
 * Inpaint an image using Vertex AI Imagen
 * Replaces masked regions with AI-generated content
 */
export async function inpaintAIImage(params: InpaintImageParams): Promise<GenerateImageResult> {
  if (!isVertexAIConfigured()) {
    throw new Error(
      "Vertex AI not configured. Please set GOOGLE_CLOUD_PROJECT environment variable.",
    );
  }

  const startTime = Date.now();

  // Inpainting requires the capability model
  const model = "imagen-3.0-capability-001";

  // Convert base64 to Buffer
  const imageBuffer = Buffer.from(stripBase64Prefix(params.imageData), "base64");
  const maskBuffer = Buffer.from(stripBase64Prefix(params.maskData), "base64");

  const result = await generateImage({
    model: vertex.image(model),
    prompt: {
      text: params.prompt,
      images: [imageBuffer],
      mask: maskBuffer,
    },
  });

  // Convert result base64 to Buffer
  const base64Data = result.image.base64;
  const resultImageData = Buffer.from(base64Data, "base64");

  // For inpainting, output dimensions match input
  // We don't know the exact dimensions without parsing the image
  // Using 1024x1024 as default, actual dimensions depend on input
  return {
    imageData: resultImageData,
    width: 1024, // Will be updated by actual image dimensions
    height: 1024,
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
 * Estimate credits for inpainting
 */
export function estimateInpaintCredits(): number {
  // Inpainting uses capability model, slightly higher cost
  return 120;
}

/**
 * Check if Vertex AI is configured and available
 */
export function isVertexAIConfigured(): boolean {
  const env = validateEnv();
  return !!env.GOOGLE_CLOUD_PROJECT;
}
