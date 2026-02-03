/**
 * Service Interfaces for Dependency Injection
 * These interfaces allow for easy mocking in tests
 */

import type { UploadOptions, UploadResult } from "../lib/r2";
import type { GenerateImageParams, GenerateImageResult } from "../lib/vertex-ai";

/**
 * Vertex AI Service Interface
 */
export interface IVertexAIService {
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  estimateCredits(params: GenerateImageParams): number;
  isConfigured(): boolean;
}

/**
 * R2 Storage Service Interface
 */
export interface IR2Service {
  upload(options: UploadOptions): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  generateImageKey(userId: string, projectId: string): string;
  isConfigured(): boolean;
}

/**
 * Service context type for Hono c.var
 */
export interface ServiceContext {
  vertexService: IVertexAIService;
  r2Service: IR2Service;
}

/**
 * Extend Hono's Variables type
 */
declare module "hono" {
  interface ContextVariableMap extends ServiceContext {}
}
