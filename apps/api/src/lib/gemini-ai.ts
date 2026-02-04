/**
 * Gemini AI Image Generation Service
 * Uses @google/genai SDK with Vertex AI backend
 */

import { GoogleGenAI } from "@google/genai";
import { validateEnv } from "../env";

export interface GenerateImageParams {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  // Image size/resolution: 1K (1024px), 2K (2048px), 4K (4096px)
  imageSize?: "1K" | "2K" | "4K";
  // Number of images to generate (1-4)
  numberOfImages?: number;
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

// Result for multiple images
export interface GenerateMultipleImagesResult {
  images: GenerateImageResult[];
  totalDurationMs: number;
}

// Image size to base pixel mapping
const IMAGE_SIZE_PIXELS: Record<string, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
};

// Calculate dimensions based on aspect ratio and image size
function calculateDimensions(
  aspectRatio: string,
  imageSize: string,
): { width: number; height: number } {
  const baseSize = IMAGE_SIZE_PIXELS[imageSize] || 1024;

  // Parse aspect ratio (e.g., "16:9" -> { w: 16, h: 9 })
  const [wRatio, hRatio] = aspectRatio.split(":").map(Number);
  if (!wRatio || !hRatio) {
    return { width: baseSize, height: baseSize };
  }

  // Calculate dimensions maintaining aspect ratio with base size as the larger dimension
  if (wRatio >= hRatio) {
    const width = baseSize;
    const height = Math.round((baseSize * hRatio) / wRatio);
    return { width, height };
  } else {
    const height = baseSize;
    const width = Math.round((baseSize * wRatio) / hRatio);
    return { width, height };
  }
}

// Default model for image generation
const DEFAULT_MODEL = "gemini-2.5-flash-image";

/**
 * Strip base64 data URL prefix if present
 */
function stripBase64Prefix(base64: string): string {
  const match = base64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64;
}

/**
 * Get Gemini AI client configured for Vertex AI
 */
function getGeminiClient(): GoogleGenAI {
  const env = validateEnv();
  return new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_VERTEX_PROJECT!,
    location: env.GOOGLE_VERTEX_LOCATION,
  });
}

/**
 * Generate images using Gemini models
 * Supports both text-to-image and image-to-image (with reference images)
 * Can generate multiple images in one request (numberOfImages parameter)
 */
export async function generateAIImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const result = await generateAIImages(params);
  if (result.images.length === 0) {
    throw new Error("No images generated");
  }
  return result.images[0];
}

/**
 * Generate a single image using Gemini models
 * Internal function used by generateAIImages
 */
async function generateSingleImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const startTime = Date.now();
  const model = params.model || DEFAULT_MODEL;
  const aspectRatio = params.aspectRatio || "1:1";
  // imageSize only supported by Gemini 3 Pro, Flash always outputs 1K
  const isProModel = model.includes("pro");
  const imageSize = isProModel ? params.imageSize || "1K" : "1K";
  const dimensions = calculateDimensions(aspectRatio, imageSize);

  const ai = getGeminiClient();

  // Build prompt text
  let promptText = params.prompt;
  if (params.negativePrompt) {
    promptText += `\n\nAvoid: ${params.negativePrompt}`;
  }

  // Build contents - either string or array with images
  type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };
  let contents: string | ContentPart[];

  if (params.referenceImages && params.referenceImages.length > 0) {
    // Image-to-image: include reference images
    const parts: ContentPart[] = [];

    for (const base64 of params.referenceImages) {
      const cleanBase64 = stripBase64Prefix(base64);
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: cleanBase64,
        },
      });
    }

    parts.push({ text: promptText });
    contents = parts;
  } else {
    // Text-to-image: just the prompt
    contents = promptText;
  }

  // Build image config - imageSize only for Pro model
  const imageConfig: {
    aspectRatio: "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
    imageSize?: "1K" | "2K" | "4K";
  } = {
    aspectRatio: aspectRatio as
      | "1:1"
      | "3:2"
      | "2:3"
      | "3:4"
      | "4:3"
      | "4:5"
      | "5:4"
      | "9:16"
      | "16:9"
      | "21:9",
  };

  // Only add imageSize for Pro model
  if (isProModel) {
    imageConfig.imageSize = imageSize as "1K" | "2K" | "4K";
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig,
    },
  });

  // Extract image from response
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error("No response generated");
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    throw new Error("No content in response");
  }

  // Find image part in response
  for (const part of candidate.content.parts) {
    if (part.inlineData && part.inlineData.data) {
      const imageData = Buffer.from(part.inlineData.data, "base64");
      const mimeType = part.inlineData.mimeType || "image/png";
      const durationMs = Date.now() - startTime;

      return {
        imageData,
        width: dimensions.width,
        height: dimensions.height,
        mimeType,
        durationMs,
      };
    }
  }

  throw new Error("No image generated in response");
}

/**
 * Generate multiple images using Gemini models
 * Uses parallel calls to generate multiple images
 */
export async function generateAIImages(
  params: GenerateImageParams,
): Promise<GenerateMultipleImagesResult> {
  if (!isGeminiConfigured()) {
    throw new Error(
      "Gemini AI not configured. Please set GOOGLE_VERTEX_PROJECT environment variable.",
    );
  }

  const startTime = Date.now();
  const numberOfImages = params.numberOfImages || 1;

  console.log("[Gemini AI] Starting image generation", {
    model: params.model || DEFAULT_MODEL,
    aspectRatio: params.aspectRatio || "1:1",
    imageSize: params.imageSize || "1K",
    numberOfImages,
    promptLength: params.prompt.length,
    hasReferenceImages: !!(params.referenceImages && params.referenceImages.length > 0),
    referenceImagesCount: params.referenceImages?.length || 0,
  });

  // Generate images in parallel
  const promises = Array.from({ length: numberOfImages }, () => generateSingleImage(params));

  const images = await Promise.all(promises);

  const totalDurationMs = Date.now() - startTime;

  console.log("[Gemini AI] Image generation complete", {
    totalDurationMs,
    imageCount: images.length,
    totalSizeBytes: images.reduce((sum, img) => sum + img.imageData.length, 0),
  });

  return {
    images,
    totalDurationMs,
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
 * Inpaint an image using Gemini models
 * Replaces masked regions with AI-generated content
 */
export async function inpaintAIImage(params: InpaintImageParams): Promise<GenerateImageResult> {
  if (!isGeminiConfigured()) {
    throw new Error(
      "Gemini AI not configured. Please set GOOGLE_VERTEX_PROJECT environment variable.",
    );
  }

  const startTime = Date.now();
  const model = DEFAULT_MODEL;

  console.log("[Gemini AI] Starting inpainting", {
    model,
    promptLength: params.prompt.length,
  });

  const ai = getGeminiClient();

  const cleanImageData = stripBase64Prefix(params.imageData);
  const cleanMaskData = stripBase64Prefix(params.maskData);

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          mimeType: "image/png",
          data: cleanImageData,
        },
      },
      {
        inlineData: {
          mimeType: "image/png",
          data: cleanMaskData,
        },
      },
      {
        text: `Edit this image. The second image is a mask where white areas indicate regions to regenerate. Replace the masked areas with: ${params.prompt}`,
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  console.log("[Gemini AI] Inpainting response received", {
    hasCandidates: !!(response.candidates && response.candidates.length > 0),
  });

  if (!response.candidates || response.candidates.length === 0) {
    console.error("[Gemini AI] No candidates in inpainting response", { response });
    throw new Error("No response generated");
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    console.error("[Gemini AI] No content in inpainting candidate", { candidate });
    throw new Error("No content in response");
  }

  // Find image part in response
  let imageData: Buffer | null = null;
  let mimeType = "image/png";

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      imageData = Buffer.from(part.inlineData.data!, "base64");
      mimeType = part.inlineData.mimeType || "image/png";
      break;
    }
  }

  if (!imageData) {
    console.error("[Gemini AI] No image in inpainting response", {
      parts: candidate.content.parts,
    });
    throw new Error("No image generated in inpainting response");
  }

  console.log("[Gemini AI] Inpainting complete", {
    durationMs: Date.now() - startTime,
    imageSizeBytes: imageData.length,
  });

  return {
    imageData,
    width: 1024,
    height: 1024,
    mimeType,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Estimate credits for an image generation
 * Credits are charged per image generated
 * 4K images cost ~80% more than 1K/2K (Pro model only)
 */
export function estimateCredits(params: GenerateImageParams): number {
  const model = params.model || DEFAULT_MODEL;
  const imageSize = params.imageSize || "1K";
  const numberOfImages = params.numberOfImages || 1;
  const isProModel = model.includes("pro");

  // Base cost per image (1K/2K)
  let costPerImage: number;
  if (isProModel) {
    costPerImage = 100; // gemini-3-pro-image-preview
    // 4K costs ~80% more (Pro model only)
    if (imageSize === "4K") {
      costPerImage = Math.round(costPerImage * 1.8);
    }
  } else {
    costPerImage = 50; // gemini-2.5-flash-image (no imageSize support)
  }

  return costPerImage * numberOfImages;
}

/**
 * Estimate credits for inpainting
 */
export function estimateInpaintCredits(): number {
  return 60;
}

/**
 * Check if Gemini AI is configured and available
 */
export function isGeminiConfigured(): boolean {
  const env = validateEnv();
  return !!env.GOOGLE_VERTEX_PROJECT;
}
