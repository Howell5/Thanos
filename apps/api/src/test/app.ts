/**
 * Test Application Factory
 * Creates a Hono app instance with mock services for testing
 */

import { Hono } from "hono";
import { servicesMiddleware } from "../middleware/services";
import type { IR2Service, IVertexAIService } from "../services/types";

export interface TestAppOptions {
  vertexService?: IVertexAIService;
  r2Service?: IR2Service;
}

/**
 * Create a test app with mock services injected
 * Note: For now, we'll test the services directly rather than through HTTP
 * This avoids complexities with mocking Better Auth
 */
export function createTestApp(options: TestAppOptions = {}) {
  const app = new Hono();

  // Inject services middleware
  app.use("*", servicesMiddleware(options));

  return app;
}
