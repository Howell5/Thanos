/**
 * Presigned Upload URL Route Tests
 * Tests for POST /api/ai-images/presign and /api/ai-images/presign/confirm endpoints
 */

import { MAX_UPLOAD_SIZE } from "@repo/shared";
import type {
  ApiFailure,
  ApiSuccess,
  ConfirmUploadResponse,
  PresignUploadResponse,
} from "@repo/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db";
import { aiImages } from "../../db/schema";
import { servicesMiddleware } from "../../middleware/services";
import { MockR2Service, createMockServices } from "../../test/mocks";
import { cleanupDatabase, createTestProject, createTestUser } from "../../test/setup";

type PresignResponse = ApiSuccess<PresignUploadResponse> | ApiFailure;
type ConfirmResponse = ApiSuccess<ConfirmUploadResponse> | ApiFailure;

// Mock the mock-session module to return test user
vi.mock("../../lib/mock-session", () => ({
  getSessionOrMock: vi.fn().mockResolvedValue({
    user: {
      id: "test-user-id",
      name: "Test User",
      email: "test@example.com",
    },
    session: {
      id: "test-session-id",
    },
  }),
  isMockSessionEnabled: vi.fn().mockReturnValue(false),
}));

// Import after mock setup
import presignRoute from "./presign";

// Create a test app with mock services
function createTestApp(mockR2?: MockR2Service) {
  const { r2Service } = createMockServices();
  const app = new Hono();

  app.use("*", servicesMiddleware({ r2Service: mockR2 ?? r2Service }));
  app.route("/presign", presignRoute);

  return { app, r2Service: mockR2 ?? r2Service };
}

describe("Presigned Upload Routes", () => {
  let testUser: { id: string; name: string; email: string; credits: number };
  let testProject: { id: string; name: string; userId: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testUser = await createTestUser({ id: "test-user-id" });
    testProject = await createTestProject(testUser.id);
  });

  describe("POST /presign", () => {
    it("should return presigned URL for valid request", async () => {
      const mockR2 = new MockR2Service();
      const { app } = createTestApp(mockR2);

      const res = await app.request("/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProject.id,
          filename: "test-image.png",
          contentType: "image/png",
          fileSize: 1024 * 1024, // 1MB
          width: 800,
          height: 600,
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as PresignResponse;
      expect(json.success).toBe(true);

      if (json.success) {
        expect(json.data.uploadUrl).toBeDefined();
        expect(json.data.cdnUrl).toBeDefined();
        expect(json.data.key).toContain(`projects/${testProject.id}/images/`);
        expect(json.data.expiresIn).toBeGreaterThan(0);
      }
    });

    it("should reject invalid content type", async () => {
      const { app } = createTestApp();

      const res = await app.request("/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProject.id,
          filename: "test.pdf",
          contentType: "application/pdf",
          fileSize: 1024,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject file size exceeding limit", async () => {
      const { app } = createTestApp();

      const res = await app.request("/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProject.id,
          filename: "huge.png",
          contentType: "image/png",
          fileSize: MAX_UPLOAD_SIZE + 1000, // Over limit
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject non-existent project", async () => {
      const { app } = createTestApp();

      const res = await app.request("/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "00000000-0000-0000-0000-000000000000",
          filename: "test.png",
          contentType: "image/png",
          fileSize: 1024,
        }),
      });

      expect(res.status).toBe(404);
    });

    it("should reject project owned by another user", async () => {
      // Create another user and their project
      const otherUser = await createTestUser({ id: "other-user-id" });
      const otherProject = await createTestProject(otherUser.id);

      const { app } = createTestApp();

      const res = await app.request("/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: otherProject.id,
          filename: "test.png",
          contentType: "image/png",
          fileSize: 1024,
        }),
      });

      expect(res.status).toBe(403);
    });

    it("should return 503 when R2 is not configured", async () => {
      const mockR2 = new MockR2Service();
      mockR2.setConfigured(false);
      const { app } = createTestApp(mockR2);

      const res = await app.request("/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProject.id,
          filename: "test.png",
          contentType: "image/png",
          fileSize: 1024,
        }),
      });

      expect(res.status).toBe(503);
    });
  });

  describe("POST /presign/confirm", () => {
    it("should create database record for confirmed upload", async () => {
      const { app } = createTestApp();
      const key = `projects/${testProject.id}/images/1234567890-abc123.png`;

      const res = await app.request("/presign/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProject.id,
          key,
          filename: "test-image.png",
          contentType: "image/png",
          fileSize: 1024 * 1024,
          width: 800,
          height: 600,
        }),
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as ConfirmResponse;
      expect(json.success).toBe(true);

      if (json.success) {
        expect(json.data.id).toBeDefined();
        expect(json.data.r2Url).toContain(key);
        expect(json.data.width).toBe(800);
        expect(json.data.height).toBe(600);
        expect(json.data.fileSize).toBe(1024 * 1024);
        expect(json.data.mimeType).toBe("image/png");
        expect(json.data.originalFileName).toBe("test-image.png");

        // Verify database record
        const db = getDb();
        const [record] = await db.select().from(aiImages).where(eq(aiImages.id, json.data.id));

        expect(record).toBeDefined();
        expect(record.source).toBe("upload");
        expect(record.creditsUsed).toBe(0);
        expect(record.status).toBe("completed");
      }
    });

    it("should reject key not matching project", async () => {
      const { app } = createTestApp();

      const res = await app.request("/presign/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProject.id,
          key: "projects/other-project/images/123.png",
          filename: "test.png",
          contentType: "image/png",
          fileSize: 1024,
          width: 100,
          height: 100,
        }),
      });

      expect(res.status).toBe(403);
    });

    it("should reject non-existent project", async () => {
      const fakeProjectId = "00000000-0000-0000-0000-000000000000";
      const { app } = createTestApp();

      const res = await app.request("/presign/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: fakeProjectId,
          key: `projects/${fakeProjectId}/images/123.png`,
          filename: "test.png",
          contentType: "image/png",
          fileSize: 1024,
          width: 100,
          height: 100,
        }),
      });

      expect(res.status).toBe(404);
    });

    it("should reject project owned by another user", async () => {
      // Create another user and their project
      const otherUser = await createTestUser({ id: "other-user-confirm-id" });
      const otherProject = await createTestProject(otherUser.id);

      const { app } = createTestApp();

      const res = await app.request("/presign/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: otherProject.id,
          key: `projects/${otherProject.id}/images/123.png`,
          filename: "test.png",
          contentType: "image/png",
          fileSize: 1024,
          width: 100,
          height: 100,
        }),
      });

      expect(res.status).toBe(403);
    });
  });
});
