/**
 * R2 Integration Test
 * Tests actual R2 upload/delete functionality
 * Run with: pnpm test r2.integration
 */

import path from "node:path";
import dotenv from "dotenv";

// Load .env file before importing r2 module
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { describe, expect, it } from "vitest";
import { deleteFromR2, isR2Configured, uploadToR2 } from "../r2";

describe("R2 Integration", () => {
  it("should check if R2 is configured", () => {
    const configured = isR2Configured();
    console.log("[R2 Test] isR2Configured:", configured);
    expect(typeof configured).toBe("boolean");
  });

  it("should upload and delete a test file", async () => {
    if (!isR2Configured()) {
      console.log("[R2 Test] Skipping - R2 not configured");
      return;
    }

    const testKey = `test/integration-test-${Date.now()}.txt`;
    const testData = Buffer.from("Hello from integration test!");

    console.log("[R2 Test] Uploading test file:", testKey);

    // Upload
    const result = await uploadToR2({
      key: testKey,
      data: testData,
      contentType: "text/plain",
      metadata: { test: "true" },
    });

    console.log("[R2 Test] Upload result:", result);

    expect(result.key).toBe(testKey);
    expect(result.url).toContain(testKey);
    expect(result.size).toBe(testData.length);

    // Clean up - delete the test file
    console.log("[R2 Test] Deleting test file:", testKey);
    await deleteFromR2(testKey);
    console.log("[R2 Test] Delete complete");
  });

  it("should upload a larger buffer (simulating image)", async () => {
    if (!isR2Configured()) {
      console.log("[R2 Test] Skipping - R2 not configured");
      return;
    }

    // Create a 1MB buffer to simulate an image
    const testKey = `test/large-file-test-${Date.now()}.bin`;
    const testData = Buffer.alloc(1024 * 1024, "x"); // 1MB of 'x'

    console.log("[R2 Test] Uploading 1MB test file:", testKey);

    const result = await uploadToR2({
      key: testKey,
      data: testData,
      contentType: "application/octet-stream",
    });

    console.log("[R2 Test] Upload result:", {
      key: result.key,
      url: result.url,
      size: result.size,
    });

    expect(result.size).toBe(1024 * 1024);

    // Clean up
    await deleteFromR2(testKey);
    console.log("[R2 Test] Cleanup complete");
  });
});
