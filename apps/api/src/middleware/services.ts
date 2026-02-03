/**
 * Services Middleware
 * Injects service instances into Hono context for dependency injection
 */

import type { MiddlewareHandler } from "hono";
import { createR2Service } from "../services/r2.service";
import type { IR2Service, IVertexAIService } from "../services/types";
import { createVertexAIService } from "../services/vertex-ai.service";

// Default service instances (created once, reused across requests)
let defaultVertexService: IVertexAIService | null = null;
let defaultR2Service: IR2Service | null = null;

function getDefaultVertexService(): IVertexAIService {
  if (!defaultVertexService) {
    defaultVertexService = createVertexAIService();
  }
  return defaultVertexService;
}

function getDefaultR2Service(): IR2Service {
  if (!defaultR2Service) {
    defaultR2Service = createR2Service();
  }
  return defaultR2Service;
}

export interface ServicesMiddlewareOptions {
  vertexService?: IVertexAIService;
  r2Service?: IR2Service;
}

/**
 * Middleware that injects services into context
 * In production, uses real services
 * In tests, allows injecting mock services
 */
export function servicesMiddleware(options?: ServicesMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    c.set("vertexService", options?.vertexService ?? getDefaultVertexService());
    c.set("r2Service", options?.r2Service ?? getDefaultR2Service());
    await next();
  };
}

/**
 * Reset default services (useful for testing)
 */
export function resetDefaultServices(): void {
  defaultVertexService = null;
  defaultR2Service = null;
}
