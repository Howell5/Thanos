/**
 * Service Interfaces for Dependency Injection
 * These interfaces allow for easy mocking in tests
 */

import type {
  GenerateImageParams,
  GenerateImageResult,
  GenerateMultipleImagesResult,
  InpaintImageParams,
} from "../lib/gemini-ai";
import type { PresignedUploadResult, UploadOptions, UploadResult } from "../lib/r2";

/**
 * Gemini AI Service Interface
 */
export interface IGeminiAIService {
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  generateImages(params: GenerateImageParams): Promise<GenerateMultipleImagesResult>;
  inpaintImage(params: InpaintImageParams): Promise<GenerateImageResult>;
  estimateCredits(params: GenerateImageParams): number;
  estimateInpaintCredits(): number;
  isConfigured(): boolean;
}

/**
 * R2 Storage Service Interface
 */
export interface IR2Service {
  upload(options: UploadOptions): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  generateImageKey(userId: string, projectId: string): string;
  generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<PresignedUploadResult>;
  isConfigured(): boolean;
}

/**
 * Service context type for Hono c.var
 */
export interface ServiceContext {
  geminiService: IGeminiAIService;
  r2Service: IR2Service;
}

/**
 * Extend Hono's Variables type
 */
declare module "hono" {
  interface ContextVariableMap extends ServiceContext {}
}
