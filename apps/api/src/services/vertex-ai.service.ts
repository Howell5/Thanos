/**
 * Vertex AI Service Implementation
 * Wraps the existing vertex-ai.ts functions into an injectable service
 */

import {
  type GenerateImageParams,
  type GenerateImageResult,
  estimateCredits,
  generateAIImage,
  isVertexAIConfigured,
} from "../lib/vertex-ai";
import type { IVertexAIService } from "./types";

/**
 * Production Vertex AI service that wraps actual API calls
 */
export class VertexAIService implements IVertexAIService {
  async generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    return generateAIImage(params);
  }

  estimateCredits(params: GenerateImageParams): number {
    return estimateCredits(params);
  }

  isConfigured(): boolean {
    return isVertexAIConfigured();
  }
}

/**
 * Create the default Vertex AI service instance
 */
export function createVertexAIService(): IVertexAIService {
  return new VertexAIService();
}
