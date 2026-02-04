/**
 * Gemini AI Service Implementation
 * Wraps the gemini-ai.ts functions into an injectable service
 */

import {
  type GenerateImageParams,
  type GenerateImageResult,
  type GenerateMultipleImagesResult,
  type InpaintImageParams,
  estimateCredits,
  estimateInpaintCredits,
  generateAIImage,
  generateAIImages,
  inpaintAIImage,
  isGeminiConfigured,
} from "../lib/gemini-ai";
import type { IGeminiAIService } from "./types";

/**
 * Production Gemini AI service that wraps actual API calls
 */
export class GeminiAIService implements IGeminiAIService {
  async generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    return generateAIImage(params);
  }

  async generateImages(params: GenerateImageParams): Promise<GenerateMultipleImagesResult> {
    return generateAIImages(params);
  }

  async inpaintImage(params: InpaintImageParams): Promise<GenerateImageResult> {
    return inpaintAIImage(params);
  }

  estimateCredits(params: GenerateImageParams): number {
    return estimateCredits(params);
  }

  estimateInpaintCredits(): number {
    return estimateInpaintCredits();
  }

  isConfigured(): boolean {
    return isGeminiConfigured();
  }
}

/**
 * Create the default Gemini AI service instance
 */
export function createGeminiAIService(): IGeminiAIService {
  return new GeminiAIService();
}
