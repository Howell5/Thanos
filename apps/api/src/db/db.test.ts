/**
 * Database Integration Tests
 * Tests database operations using the real database with cleanup
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanupDatabase, createTestProject, createTestUser } from "../test/setup";
import { getDb } from "./index";
import { aiImages, aiUsageHistory, projects, user } from "./schema";

describe("Database Operations", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe("User Operations", () => {
    it("should create and retrieve a user", async () => {
      const testUser = await createTestUser({
        name: "Test User",
        email: "test@example.com",
        credits: 500,
      });

      const db = getDb();
      const result = await db.query.user.findFirst({
        where: eq(user.id, testUser.id),
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("Test User");
      expect(result?.email).toBe("test@example.com");
      expect(result?.credits).toBe(500);
    });

    it("should update user credits", async () => {
      const testUser = await createTestUser({ credits: 1000 });
      const db = getDb();

      await db.update(user).set({ credits: 900 }).where(eq(user.id, testUser.id));

      const result = await db.query.user.findFirst({
        where: eq(user.id, testUser.id),
      });

      expect(result?.credits).toBe(900);
    });
  });

  describe("Project Operations", () => {
    it("should create and retrieve a project", async () => {
      const testUser = await createTestUser();
      const testProject = await createTestProject(testUser.id, {
        name: "My Project",
        description: "A test project",
      });

      const db = getDb();
      const result = await db.query.projects.findFirst({
        where: eq(projects.id, testProject.id),
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("My Project");
      expect(result?.description).toBe("A test project");
      expect(result?.userId).toBe(testUser.id);
    });

    it("should cascade delete projects when user is deleted", async () => {
      const testUser = await createTestUser();
      const testProject = await createTestProject(testUser.id);

      const db = getDb();
      await db.delete(user).where(eq(user.id, testUser.id));

      const result = await db.query.projects.findFirst({
        where: eq(projects.id, testProject.id),
      });

      expect(result).toBeUndefined();
    });
  });

  describe("AI Image Operations", () => {
    it("should create an AI image record", async () => {
      const testUser = await createTestUser();
      const testProject = await createTestProject(testUser.id);

      const db = getDb();
      const [imageRecord] = await db
        .insert(aiImages)
        .values({
          projectId: testProject.id,
          userId: testUser.id,
          prompt: "A beautiful sunset",
          model: "imagen-3.0-generate-001",
          aspectRatio: "16:9",
          r2Key: "projects/test/images/123.png",
          r2Url: "https://img.thanos.art/projects/test/images/123.png",
          width: 1792,
          height: 1024,
          fileSize: 1024000,
          mimeType: "image/png",
          creditsUsed: 100,
          status: "completed",
        })
        .returning();

      expect(imageRecord.id).toBeDefined();
      expect(imageRecord.prompt).toBe("A beautiful sunset");
      expect(imageRecord.creditsUsed).toBe(100);
    });

    it("should query images with project relation", async () => {
      const testUser = await createTestUser();
      const testProject = await createTestProject(testUser.id, { name: "Art Project" });

      const db = getDb();
      await db.insert(aiImages).values({
        projectId: testProject.id,
        userId: testUser.id,
        prompt: "Test prompt",
        model: "imagen-3.0-generate-001",
        aspectRatio: "1:1",
        r2Key: "test.png",
        r2Url: "https://img.thanos.art/test.png",
        width: 1024,
        height: 1024,
        fileSize: 500000,
        mimeType: "image/png",
        creditsUsed: 100,
        status: "completed",
      });

      const images = await db.query.aiImages.findMany({
        where: eq(aiImages.projectId, testProject.id),
        with: {
          project: {
            columns: { id: true, name: true },
          },
        },
      });

      expect(images).toHaveLength(1);
      expect(images[0].project?.name).toBe("Art Project");
    });
  });

  describe("AI Usage History", () => {
    it("should create usage history records", async () => {
      const testUser = await createTestUser();
      const testProject = await createTestProject(testUser.id);

      const db = getDb();
      const [historyRecord] = await db
        .insert(aiUsageHistory)
        .values({
          userId: testUser.id,
          projectId: testProject.id,
          operation: "text-to-image",
          model: "imagen-3.0-generate-001",
          provider: "vertex-ai",
          creditsCharged: 100,
          durationMs: 2500,
          success: true,
        })
        .returning();

      expect(historyRecord.id).toBeDefined();
      expect(historyRecord.operation).toBe("text-to-image");
      expect(historyRecord.success).toBe(true);
    });

    it("should track failed operations", async () => {
      const testUser = await createTestUser();
      const testProject = await createTestProject(testUser.id);

      const db = getDb();
      const [historyRecord] = await db
        .insert(aiUsageHistory)
        .values({
          userId: testUser.id,
          projectId: testProject.id,
          operation: "text-to-image",
          model: "imagen-3.0-generate-001",
          provider: "vertex-ai",
          creditsCharged: 0,
          durationMs: 500,
          success: false,
          errorMessage: "API rate limit exceeded",
        })
        .returning();

      expect(historyRecord.success).toBe(false);
      expect(historyRecord.errorMessage).toBe("API rate limit exceeded");
      expect(historyRecord.creditsCharged).toBe(0);
    });
  });
});
