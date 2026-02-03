/**
 * Mock Services for Testing
 * Provides mock implementations of services that can be injected via DI
 */

import type { UploadOptions, UploadResult } from "../lib/r2";
import type { GenerateImageParams, GenerateImageResult, InpaintImageParams } from "../lib/vertex-ai";
import type { IR2Service, IVertexAIService } from "../services/types";

/**
 * Mock Vertex AI Service
 * Simulates AI image generation without making actual API calls
 */
export class MockVertexAIService implements IVertexAIService {
  private _isConfigured = true;
  private _shouldFail = false;
  private _failMessage = "Mock AI generation failed";
  private _generateCalls: GenerateImageParams[] = [];
  private _inpaintCalls: InpaintImageParams[] = [];

  async generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    this._generateCalls.push(params);

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    // Return a mock image result
    const aspectRatio = params.aspectRatio || "1:1";
    const dimensions = this.getDimensions(aspectRatio);

    return {
      imageData: Buffer.from("mock-image-data"),
      width: dimensions.width,
      height: dimensions.height,
      mimeType: "image/png",
      durationMs: 1000,
    };
  }

  async inpaintImage(params: InpaintImageParams): Promise<GenerateImageResult> {
    this._inpaintCalls.push(params);

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    // Return a mock inpainted image result
    return {
      imageData: Buffer.from("mock-inpainted-image-data"),
      width: 1024,
      height: 1024,
      mimeType: "image/png",
      durationMs: 1500,
    };
  }

  estimateCredits(params: GenerateImageParams): number {
    const model = params.model || "imagen-3.0-generate-001";
    if (model.includes("fast")) {
      return 50;
    }
    return 100;
  }

  estimateInpaintCredits(): number {
    return 120;
  }

  isConfigured(): boolean {
    return this._isConfigured;
  }

  // Test helpers
  setConfigured(configured: boolean): void {
    this._isConfigured = configured;
  }

  setFailure(shouldFail: boolean, message?: string): void {
    this._shouldFail = shouldFail;
    if (message) {
      this._failMessage = message;
    }
  }

  getGenerateCalls(): GenerateImageParams[] {
    return this._generateCalls;
  }

  getInpaintCalls(): InpaintImageParams[] {
    return this._inpaintCalls;
  }

  reset(): void {
    this._isConfigured = true;
    this._shouldFail = false;
    this._failMessage = "Mock AI generation failed";
    this._generateCalls = [];
    this._inpaintCalls = [];
  }

  private getDimensions(aspectRatio: string): { width: number; height: number } {
    const dimensions: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1024, height: 1024 },
      "16:9": { width: 1792, height: 1024 },
      "9:16": { width: 1024, height: 1792 },
      "4:3": { width: 1024, height: 768 },
      "3:4": { width: 768, height: 1024 },
    };
    return dimensions[aspectRatio] || dimensions["1:1"];
  }
}

/**
 * Mock R2 Service
 * Simulates R2 storage operations without making actual API calls
 */
export class MockR2Service implements IR2Service {
  private _isConfigured = true;
  private _shouldFail = false;
  private _failMessage = "Mock R2 upload failed";
  private _uploadCalls: UploadOptions[] = [];
  private _deleteCalls: string[] = [];

  async upload(options: UploadOptions): Promise<UploadResult> {
    this._uploadCalls.push(options);

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    return {
      key: options.key,
      url: `https://img.berryon.art/${options.key}`,
      size: options.data.length,
    };
  }

  async delete(key: string): Promise<void> {
    this._deleteCalls.push(key);

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }
  }

  generateImageKey(userId: string, projectId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `projects/${projectId}/images/${timestamp}-${random}.png`;
  }

  isConfigured(): boolean {
    return this._isConfigured;
  }

  // Test helpers
  setConfigured(configured: boolean): void {
    this._isConfigured = configured;
  }

  setFailure(shouldFail: boolean, message?: string): void {
    this._shouldFail = shouldFail;
    if (message) {
      this._failMessage = message;
    }
  }

  getUploadCalls(): UploadOptions[] {
    return this._uploadCalls;
  }

  getDeleteCalls(): string[] {
    return this._deleteCalls;
  }

  reset(): void {
    this._isConfigured = true;
    this._shouldFail = false;
    this._failMessage = "Mock R2 upload failed";
    this._uploadCalls = [];
    this._deleteCalls = [];
  }
}

/**
 * Create fresh mock services for a test
 */
export function createMockServices(): {
  vertexService: MockVertexAIService;
  r2Service: MockR2Service;
} {
  return {
    vertexService: new MockVertexAIService(),
    r2Service: new MockR2Service(),
  };
}
