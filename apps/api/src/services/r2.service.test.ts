/**
 * R2 Service Tests
 * Tests the service layer without making actual API calls
 */

import { describe, expect, it } from "vitest";
import { MockR2Service } from "../test/mocks";

describe("MockR2Service", () => {
  it("should upload a file successfully", async () => {
    const service = new MockR2Service();
    const data = Buffer.from("test image data");

    const result = await service.upload({
      key: "projects/test-project/images/test.png",
      data,
      contentType: "image/png",
    });

    expect(result.key).toBe("projects/test-project/images/test.png");
    expect(result.url).toBe("https://img.thanos.art/projects/test-project/images/test.png");
    expect(result.size).toBe(data.length);
  });

  it("should track upload calls", async () => {
    const service = new MockR2Service();

    await service.upload({
      key: "first.png",
      data: Buffer.from("first"),
      contentType: "image/png",
    });

    await service.upload({
      key: "second.png",
      data: Buffer.from("second"),
      contentType: "image/png",
      metadata: { userId: "user-1" },
    });

    const calls = service.getUploadCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].key).toBe("first.png");
    expect(calls[1].key).toBe("second.png");
    expect(calls[1].metadata).toEqual({ userId: "user-1" });
  });

  it("should fail when configured to fail", async () => {
    const service = new MockR2Service();
    service.setFailure(true, "Storage unavailable");

    await expect(
      service.upload({
        key: "test.png",
        data: Buffer.from("test"),
        contentType: "image/png",
      }),
    ).rejects.toThrow("Storage unavailable");
  });

  it("should delete a file successfully", async () => {
    const service = new MockR2Service();

    await service.delete("projects/test/images/old.png");

    const calls = service.getDeleteCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("projects/test/images/old.png");
  });

  it("should fail delete when configured to fail", async () => {
    const service = new MockR2Service();
    service.setFailure(true);

    await expect(service.delete("test.png")).rejects.toThrow();
  });

  it("should generate unique image keys", () => {
    const service = new MockR2Service();

    const key1 = service.generateImageKey("user-1", "project-1");
    const key2 = service.generateImageKey("user-1", "project-1");

    expect(key1).toMatch(/^projects\/project-1\/images\/\d+-[a-z0-9]+\.png$/);
    expect(key2).toMatch(/^projects\/project-1\/images\/\d+-[a-z0-9]+\.png$/);
    // Keys should be different due to timestamp and random suffix
    expect(key1).not.toBe(key2);
  });

  it("should report configured status", () => {
    const service = new MockR2Service();

    expect(service.isConfigured()).toBe(true);

    service.setConfigured(false);
    expect(service.isConfigured()).toBe(false);
  });

  it("should reset state correctly", async () => {
    const service = new MockR2Service();

    service.setConfigured(false);
    service.setFailure(true);
    await service
      .upload({ key: "test", data: Buffer.from(""), contentType: "image/png" })
      .catch(() => {});

    service.reset();

    expect(service.isConfigured()).toBe(true);
    expect(service.getUploadCalls()).toHaveLength(0);
    expect(service.getDeleteCalls()).toHaveLength(0);
    // Should not throw after reset
    await expect(
      service.upload({ key: "test", data: Buffer.from(""), contentType: "image/png" }),
    ).resolves.toBeDefined();
  });
});
