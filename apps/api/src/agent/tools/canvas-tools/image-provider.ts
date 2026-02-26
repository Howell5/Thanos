/**
 * Image provider abstraction layer.
 * Routes generation requests to Gemini or fal.ai based on model name.
 * Handles reference images transparently — Seedream uses the "edit" endpoint
 * for reference-based generation, Gemini passes them as inline content.
 */

import { editFalImage, generateFalImage, isFalConfigured } from "../../../lib/fal-ai";
import type { GenerateImageParams, GenerateImageResult } from "../../../lib/gemini-ai";
import {
  estimateCredits as geminiEstimateCredits,
  generateAIImage,
  isGeminiConfigured,
} from "../../../lib/gemini-ai";

// Known model names
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash-image";
export const GEMINI_PRO_MODEL = "gemini-3-pro-image-preview";
export const SEEDREAM_MODEL = "seedream-v5";

export type ImageModel =
  | typeof GEMINI_FLASH_MODEL
  | typeof GEMINI_PRO_MODEL
  | typeof SEEDREAM_MODEL;

export function isSeedreamModel(model: string): boolean {
  return model === SEEDREAM_MODEL || model.startsWith("seedream");
}

/** Check if a model is available based on env configuration */
export function isModelAvailable(model: string): boolean {
  if (isSeedreamModel(model)) return isFalConfigured();
  return isGeminiConfigured();
}

/** Get the provider name for a model */
export function getProviderName(model: string): "gemini" | "fal" {
  return isSeedreamModel(model) ? "fal" : "gemini";
}

export interface GenerateRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  aspectRatio?: string;
  imageSize?: "1K" | "2K" | "4K";
  numberOfImages?: number;
  /** Base64 reference images (used by Gemini as inline content) */
  referenceImages?: string[];
  /** URLs of reference images (used by Seedream's edit endpoint, up to 10) */
  referenceImageUrls?: string[];
}

/**
 * Generate image(s) using the appropriate provider.
 *
 * When references are provided:
 * - Gemini: passes them as inline base64 content alongside the prompt
 * - Seedream: routes to the fal "edit" endpoint (reference-based generation)
 *
 * This means the caller doesn't need to know which endpoint to hit —
 * just provide references and the provider handles the routing.
 */
export async function generateWithProvider(req: GenerateRequest): Promise<GenerateImageResult[]> {
  if (isSeedreamModel(req.model)) {
    // Seedream with reference → use edit endpoint (works for both editing and ref-based gen)
    if (req.referenceImageUrls?.length) {
      const result = await editFalImage({
        prompt: req.prompt,
        imageUrls: req.referenceImageUrls,
        negativePrompt: req.negativePrompt,
      });
      return [result];
    }
    // Seedream without reference → text-to-image
    return generateFalImage({
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      aspectRatio: req.aspectRatio,
      numberOfImages: req.numberOfImages,
    });
  }

  // Gemini: handles both t2i and reference-based via referenceImages param
  const params: GenerateImageParams = {
    prompt: req.prompt,
    negativePrompt: req.negativePrompt,
    model: req.model,
    aspectRatio: req.aspectRatio,
    imageSize: req.imageSize,
    numberOfImages: req.numberOfImages || 1,
    referenceImages: req.referenceImages,
  };
  const result = await generateAIImage(params);
  return [result];
}

/**
 * Estimate credits for a model + image size combo
 */
export function estimateCreditsForModel(model: string, imageSize?: string): number {
  if (isSeedreamModel(model)) return 40;
  return geminiEstimateCredits({ prompt: "", model, imageSize: imageSize as "1K" | "2K" | "4K" });
}
