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
  generateMediaKey(userId: string, projectId: string, extension: string): string;
  generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<PresignedUploadResult>;
  isConfigured(): boolean;
}

/**
 * TTS (Text-to-Speech) Service Interface
 */
export interface ITTSService {
  /** Synthesize text to speech, upload to R2, return CDN URL */
  synthesize(text: string, voiceId?: string, speed?: number): Promise<string>;
  /** Batch synthesize multiple texts in parallel, return CDN URLs */
  batchSynthesize(
    segments: { text: string; voiceId?: string; speed?: number }[],
  ): Promise<string[]>;
  /** Check if TTS service is configured */
  isConfigured(): boolean;
}

/**
 * Video Render Service Interface
 */
export interface IVideoRenderService {
  /** Start rendering an editing plan into a video */
  startRender(planId: string): Promise<{ renderId: string }>;
  /** Get render progress */
  getRenderProgress(renderId: string): Promise<{ progress: number; status: string }>;
  /** Render and wait for completion, returning the final result */
  renderAndWait(planId: string): Promise<{
    status: "done" | "failed";
    outputUrl?: string;
    error?: string;
  }>;
  /** Check if render service is configured */
  isConfigured(): boolean;
}

/**
 * Service context type for Hono c.var
 */
export interface ServiceContext {
  geminiService: IGeminiAIService;
  r2Service: IR2Service;
  ttsService: ITTSService;
  videoRenderService: IVideoRenderService;
}

/**
 * Extend Hono's Variables type
 */
declare module "hono" {
  interface ContextVariableMap extends ServiceContext {}
}
