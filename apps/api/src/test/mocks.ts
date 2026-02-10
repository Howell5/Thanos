/**
 * Mock Services for Testing
 * Provides mock implementations of services that can be injected via DI
 */

import type {
  GenerateImageParams,
  GenerateImageResult,
  GenerateMultipleImagesResult,
  InpaintImageParams,
} from "../lib/gemini-ai";
import type { PresignedUploadResult, UploadOptions, UploadResult } from "../lib/r2";
import type {
  IGeminiAIService,
  IR2Service,
  ITTSService,
  IVideoRenderService,
} from "../services/types";

/**
 * Mock Gemini AI Service
 * Simulates AI image generation without making actual API calls
 */
export class MockGeminiAIService implements IGeminiAIService {
  private _isConfigured = true;
  private _shouldFail = false;
  private _failMessage = "Mock AI generation failed";
  private _generateCalls: GenerateImageParams[] = [];
  private _inpaintCalls: InpaintImageParams[] = [];

  async generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    const result = await this.generateImages(params);
    return result.images[0];
  }

  async generateImages(params: GenerateImageParams): Promise<GenerateMultipleImagesResult> {
    this._generateCalls.push(params);

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    // Return mock image results
    const aspectRatio = params.aspectRatio || "1:1";
    const dimensions = this.getDimensions(aspectRatio);
    const numberOfImages = params.numberOfImages || 1;

    const images: GenerateImageResult[] = [];
    for (let i = 0; i < numberOfImages; i++) {
      images.push({
        imageData: Buffer.from(`mock-image-data-${i}`),
        width: dimensions.width,
        height: dimensions.height,
        mimeType: "image/png",
        durationMs: 1000,
      });
    }

    return {
      images,
      totalDurationMs: 1000,
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
    const model = params.model || "gemini-2.5-flash-image";
    const numberOfImages = params.numberOfImages || 1;
    const costPerImage = model.includes("pro") ? 100 : 50;
    return costPerImage * numberOfImages;
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
      url: `https://img.thanos.art/${options.key}`,
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

  generateMediaKey(userId: string, projectId: string, extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `projects/${projectId}/media/${timestamp}-${random}.${extension}`;
  }

  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 1800,
  ): Promise<PresignedUploadResult> {
    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    return {
      uploadUrl: `https://mock-presign-url.r2.cloudflarestorage.com/${key}?signature=mock`,
      cdnUrl: `https://img.thanos.art/${key}`,
      key,
      expiresIn,
    };
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
 * Mock TTS Service
 * Simulates text-to-speech synthesis without making actual API calls
 */
export class MockTTSService implements ITTSService {
  private _isConfigured = true;
  private _shouldFail = false;
  private _failMessage = "Mock TTS synthesis failed";
  private _synthesizeCalls: { text: string; voiceId?: string; speed?: number }[] = [];

  async synthesize(text: string, voiceId?: string, speed?: number): Promise<string> {
    this._synthesizeCalls.push({ text, voiceId, speed });

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `https://img.thanos.art/tts/${timestamp}-${random}.mp3`;
  }

  async batchSynthesize(
    segments: { text: string; voiceId?: string; speed?: number }[],
  ): Promise<string[]> {
    return Promise.all(segments.map((s) => this.synthesize(s.text, s.voiceId, s.speed)));
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

  getSynthesizeCalls(): { text: string; voiceId?: string; speed?: number }[] {
    return this._synthesizeCalls;
  }

  reset(): void {
    this._isConfigured = true;
    this._shouldFail = false;
    this._failMessage = "Mock TTS synthesis failed";
    this._synthesizeCalls = [];
  }
}

/**
 * Mock Video Render Service
 * Simulates video rendering without actual Remotion or R2 calls
 */
export class MockVideoRenderService implements IVideoRenderService {
  private _isConfigured = true;
  private _shouldFail = false;
  private _failMessage = "Mock render failed";
  private _startRenderCalls: string[] = [];
  private _progressMap = new Map<string, { progress: number; status: string }>();

  async startRender(planId: string): Promise<{ renderId: string }> {
    this._startRenderCalls.push(planId);

    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }

    const renderId = crypto.randomUUID();
    this._progressMap.set(renderId, { progress: 1, status: "done" });
    return { renderId };
  }

  async getRenderProgress(renderId: string): Promise<{ progress: number; status: string }> {
    const progress = this._progressMap.get(renderId);
    if (!progress) {
      return { progress: 0, status: "not_found" };
    }
    return progress;
  }

  async renderAndWait(
    _planId: string,
  ): Promise<{ status: "done" | "failed"; outputUrl?: string; error?: string }> {
    if (this._shouldFail) {
      return { status: "failed", error: this._failMessage };
    }
    return { status: "done", outputUrl: "https://img.thanos.art/mock-render-output.mp4" };
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

  getStartRenderCalls(): string[] {
    return this._startRenderCalls;
  }

  reset(): void {
    this._isConfigured = true;
    this._shouldFail = false;
    this._failMessage = "Mock render failed";
    this._startRenderCalls = [];
    this._progressMap.clear();
  }
}

/**
 * Create fresh mock services for a test
 */
export function createMockServices(): {
  geminiService: MockGeminiAIService;
  r2Service: MockR2Service;
  ttsService: MockTTSService;
  videoRenderService: MockVideoRenderService;
} {
  return {
    geminiService: new MockGeminiAIService(),
    r2Service: new MockR2Service(),
    ttsService: new MockTTSService(),
    videoRenderService: new MockVideoRenderService(),
  };
}
