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

// Aspect ratio to dimensions mapping
// Based on ~1024px base size for optimal quality
const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:2": { width: 1024, height: 683 },
  "2:3": { width: 683, height: 1024 },
  "3:4": { width: 768, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "4:5": { width: 819, height: 1024 },
  "5:4": { width: 1024, height: 819 },
  "9:16": { width: 576, height: 1024 },
  "16:9": { width: 1024, height: 576 },
  "21:9": { width: 1024, height: 439 },
};

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
async function generateSingleImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const startTime = Date.now();
  const model = params.model || DEFAULT_MODEL;
  const aspectRatio = params.aspectRatio || "1:1";
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS["1:1"];

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

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
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
      },
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
    numberOfImages,
    promptLength: params.prompt.length,
    hasReferenceImages: !!(params.referenceImages && params.referenceImages.length > 0),
    referenceImagesCount: params.referenceImages?.length || 0,
  });

  // Generate images in parallel
  const promises = Array.from({ length: numberOfImages }, () =>
    generateSingleImage(params),
  );

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
 */
export function estimateCredits(params: GenerateImageParams): number {
  const model = params.model || DEFAULT_MODEL;
  const numberOfImages = params.numberOfImages || 1;

  // Base cost per image
  let costPerImage: number;
  if (model.includes("flash")) {
    costPerImage = 50; // gemini-2.5-flash-image is cheaper
  } else {
    costPerImage = 100; // gemini-3-pro-image-preview is more expensive
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
