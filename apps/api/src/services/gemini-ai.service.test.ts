/**
 * Gemini AI Service Tests
 * Tests the service layer without making actual API calls
 */

import { describe, expect, it } from "vitest";
import type { GenerateImageParams } from "../lib/gemini-ai";
import { MockGeminiAIService } from "../test/mocks";

describe("MockGeminiAIService", () => {
  it("should generate an image successfully", async () => {
    const service = new MockGeminiAIService();
    const params: GenerateImageParams = {
      prompt: "A beautiful sunset",
      aspectRatio: "16:9",
    };

    const result = await service.generateImage(params);

    expect(result.imageData).toBeInstanceOf(Buffer);
    expect(result.width).toBe(1792);
    expect(result.height).toBe(1024);
    expect(result.mimeType).toBe("image/png");
    expect(result.durationMs).toBe(1000);
  });

  it("should return correct dimensions for different aspect ratios", async () => {
    const service = new MockGeminiAIService();

    const testCases = [
      { aspectRatio: "1:1", expectedWidth: 1024, expectedHeight: 1024 },
      { aspectRatio: "16:9", expectedWidth: 1792, expectedHeight: 1024 },
      { aspectRatio: "9:16", expectedWidth: 1024, expectedHeight: 1792 },
      { aspectRatio: "4:3", expectedWidth: 1024, expectedHeight: 768 },
      { aspectRatio: "3:4", expectedWidth: 768, expectedHeight: 1024 },
    ];

    for (const testCase of testCases) {
      const result = await service.generateImage({
        prompt: "test",
        aspectRatio: testCase.aspectRatio,
      });
      expect(result.width).toBe(testCase.expectedWidth);
      expect(result.height).toBe(testCase.expectedHeight);
    }
  });

  it("should track generate calls", async () => {
    const service = new MockGeminiAIService();

    await service.generateImage({ prompt: "First prompt" });
    await service.generateImage({ prompt: "Second prompt", aspectRatio: "16:9" });

    const calls = service.getGenerateCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].prompt).toBe("First prompt");
    expect(calls[1].prompt).toBe("Second prompt");
  });

  it("should fail when configured to fail", async () => {
    const service = new MockGeminiAIService();
    service.setFailure(true, "Test failure message");

    await expect(service.generateImage({ prompt: "test" })).rejects.toThrow("Test failure message");
  });

  it("should estimate credits correctly", () => {
    const service = new MockGeminiAIService();

    // Default model (gemini-2.5-flash-image) costs 50
    expect(service.estimateCredits({ prompt: "test" })).toBe(50);
    expect(service.estimateCredits({ prompt: "test", model: "gemini-2.5-flash-image" })).toBe(50);
    // Pro model costs 100
    expect(service.estimateCredits({ prompt: "test", model: "gemini-3-pro-image-preview" })).toBe(100);
  });

  it("should report configured status", () => {
    const service = new MockGeminiAIService();

    expect(service.isConfigured()).toBe(true);

    service.setConfigured(false);
    expect(service.isConfigured()).toBe(false);
  });

  it("should reset state correctly", async () => {
    const service = new MockGeminiAIService();

    service.setConfigured(false);
    service.setFailure(true);
    await service.generateImage({ prompt: "test" }).catch(() => {});

    service.reset();

    expect(service.isConfigured()).toBe(true);
    expect(service.getGenerateCalls()).toHaveLength(0);
    // Should not throw after reset
    await expect(service.generateImage({ prompt: "test" })).resolves.toBeDefined();
  });
});
