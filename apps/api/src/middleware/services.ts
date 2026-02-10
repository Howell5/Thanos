/**
 * Services Middleware
 * Injects service instances into Hono context for dependency injection
 */

import type { MiddlewareHandler } from "hono";
import { createGeminiAIService } from "../services/gemini-ai.service";
import { createR2Service } from "../services/r2.service";
import { createTTSService } from "../services/tts.service";
import type {
  IGeminiAIService,
  IR2Service,
  ITTSService,
  IVideoRenderService,
} from "../services/types";
import { createVideoRenderService } from "../services/video-render.service";

// Default service instances (created once, reused across requests)
let defaultGeminiService: IGeminiAIService | null = null;
let defaultR2Service: IR2Service | null = null;
let defaultTTSService: ITTSService | null = null;
let defaultVideoRenderService: IVideoRenderService | null = null;

function getDefaultGeminiService(): IGeminiAIService {
  if (!defaultGeminiService) {
    defaultGeminiService = createGeminiAIService();
  }
  return defaultGeminiService;
}

function getDefaultR2Service(): IR2Service {
  if (!defaultR2Service) {
    defaultR2Service = createR2Service();
  }
  return defaultR2Service;
}

function getDefaultTTSService(): ITTSService {
  if (!defaultTTSService) {
    defaultTTSService = createTTSService();
  }
  return defaultTTSService;
}

function getDefaultVideoRenderService(): IVideoRenderService {
  if (!defaultVideoRenderService) {
    defaultVideoRenderService = createVideoRenderService();
  }
  return defaultVideoRenderService;
}

export interface ServicesMiddlewareOptions {
  geminiService?: IGeminiAIService;
  r2Service?: IR2Service;
  ttsService?: ITTSService;
  videoRenderService?: IVideoRenderService;
}

/**
 * Middleware that injects services into context
 * In production, uses real services
 * In tests, allows injecting mock services
 */
export function servicesMiddleware(options?: ServicesMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    c.set("geminiService", options?.geminiService ?? getDefaultGeminiService());
    c.set("r2Service", options?.r2Service ?? getDefaultR2Service());
    c.set("ttsService", options?.ttsService ?? getDefaultTTSService());
    c.set("videoRenderService", options?.videoRenderService ?? getDefaultVideoRenderService());
    await next();
  };
}

/**
 * Reset default services (useful for testing)
 */
export function resetDefaultServices(): void {
  defaultGeminiService = null;
  defaultR2Service = null;
  defaultTTSService = null;
  defaultVideoRenderService = null;
}
