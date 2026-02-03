import { zValidator } from "@hono/zod-validator";
import {
  generateImageSchema,
  generationHistorySchema,
  inpaintImageSchema,
  projectIdSchema,
} from "@repo/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { aiImages, aiUsageHistory, projects, user } from "../db/schema";
import { getSessionOrMock } from "../lib/mock-session";
import type { UploadResult } from "../lib/r2";
import {
  AI_GENERATION_LIMIT,
  checkRateLimit,
  getAIGenerationRateLimitKey,
} from "../lib/rate-limit";
import { err, errors, ok } from "../lib/response";
import type { GenerateImageResult } from "../lib/vertex-ai";
import "../services/types"; // Import type augmentation

const aiImagesRoute = new Hono()
  /**
   * POST /ai-images/generate
   * Generate an AI image and add to project
   */
  .post("/generate", zValidator("json", generateImageSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    // Get services from context
    const vertexService = c.var.vertexService;
    const r2Service = c.var.r2Service;

    // Check if Vertex AI is configured
    if (!vertexService.isConfigured()) {
      return errors.serviceUnavailable(c, "AI image generation is not configured");
    }

    const data = c.req.valid("json");
    const { projectId, prompt, negativePrompt, aspectRatio, model, referenceImages } = data;

    // Determine operation type based on whether reference images are provided
    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    const operation = hasReferenceImages ? "image-to-image" : "text-to-image";

    // Rate limiting
    const rateLimit = checkRateLimit(
      getAIGenerationRateLimitKey(session.user.id),
      AI_GENERATION_LIMIT,
    );
    if (rateLimit.limited) {
      return errors.tooManyRequests(
        c,
        "AI generation rate limit exceeded. Please try again later.",
      );
    }

    // Check project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return errors.notFound(c, "Project not found");
    }

    if (project.userId !== session.user.id) {
      return errors.forbidden(c, "You don't have access to this project");
    }

    // Check user credits
    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { credits: true },
    });

    const creditsRequired = vertexService.estimateCredits({ prompt, model });

    if (!userRecord || userRecord.credits < creditsRequired) {
      return err(c, 402, "Insufficient credits to generate image", "INSUFFICIENT_CREDITS");
    }

    // Generate image using Vertex AI
    const startTime = Date.now();
    let generateResult: GenerateImageResult;
    let errorMessage: string | undefined;

    try {
      generateResult = await vertexService.generateImage({
        prompt,
        negativePrompt,
        model,
        aspectRatio,
        referenceImages,
      });
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : "Unknown error during image generation";

      // Log usage even on failure
      await db.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        operation,
        model: hasReferenceImages ? "imagen-3.0-capability-001" : model || "imagen-3.0-generate-001",
        provider: "vertex-ai",
        creditsCharged: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      return errors.internal(c, errorMessage);
    }

    // Upload to R2
    const imageKey = r2Service.generateImageKey(session.user.id, projectId);
    let uploadResult: UploadResult;

    try {
      uploadResult = await r2Service.upload({
        key: imageKey,
        data: generateResult.imageData,
        contentType: generateResult.mimeType,
        metadata: {
          userId: session.user.id,
          projectId,
          prompt,
        },
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to upload image";

      // Log usage even on upload failure
      await db.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        operation,
        model: hasReferenceImages ? "imagen-3.0-capability-001" : model || "imagen-3.0-generate-001",
        provider: "vertex-ai",
        creditsCharged: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      return errors.internal(c, "Failed to save generated image");
    }

    // Atomic transaction: deduct credits + create records
    const result = await db.transaction(async (tx) => {
      // Deduct credits
      await tx
        .update(user)
        .set({
          credits: userRecord.credits - creditsRequired,
        })
        .where(eq(user.id, session.user.id));

      // Create AI image record
      const [imageRecord] = await tx
        .insert(aiImages)
        .values({
          projectId,
          userId: session.user.id,
          prompt,
          negativePrompt,
          model: hasReferenceImages
            ? "imagen-3.0-capability-001"
            : model || "imagen-3.0-generate-001",
          aspectRatio: aspectRatio || "1:1",
          r2Key: imageKey,
          r2Url: uploadResult.url,
          width: generateResult.width,
          height: generateResult.height,
          fileSize: uploadResult.size,
          mimeType: generateResult.mimeType,
          creditsUsed: creditsRequired,
          status: "completed",
        })
        .returning();

      // Create usage history record
      await tx.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        imageId: imageRecord.id,
        operation,
        model: hasReferenceImages ? "imagen-3.0-capability-001" : model || "imagen-3.0-generate-001",
        provider: "vertex-ai",
        creditsCharged: creditsRequired,
        durationMs: generateResult.durationMs,
        success: true,
      });

      return imageRecord;
    });

    return ok(
      c,
      {
        image: result,
        creditsUsed: creditsRequired,
        creditsRemaining: userRecord.credits - creditsRequired,
      },
      201,
    );
  })

  /**
   * POST /ai-images/inpaint
   * Inpaint (edit) a region of an image
   */
  .post("/inpaint", zValidator("json", inpaintImageSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    // Get services from context
    const vertexService = c.var.vertexService;
    const r2Service = c.var.r2Service;

    // Check if Vertex AI is configured
    if (!vertexService.isConfigured()) {
      return errors.serviceUnavailable(c, "AI image generation is not configured");
    }

    const data = c.req.valid("json");
    const { projectId, prompt, imageData, maskData } = data;

    // Rate limiting
    const rateLimit = checkRateLimit(
      getAIGenerationRateLimitKey(session.user.id),
      AI_GENERATION_LIMIT,
    );
    if (rateLimit.limited) {
      return errors.tooManyRequests(
        c,
        "AI generation rate limit exceeded. Please try again later.",
      );
    }

    // Check project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return errors.notFound(c, "Project not found");
    }

    if (project.userId !== session.user.id) {
      return errors.forbidden(c, "You don't have access to this project");
    }

    // Check user credits
    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { credits: true },
    });

    const creditsRequired = vertexService.estimateInpaintCredits();

    if (!userRecord || userRecord.credits < creditsRequired) {
      return err(c, 402, "Insufficient credits to inpaint image", "INSUFFICIENT_CREDITS");
    }

    // Inpaint image using Vertex AI
    const startTime = Date.now();
    let inpaintResult: GenerateImageResult;
    let errorMessage: string | undefined;

    try {
      inpaintResult = await vertexService.inpaintImage({
        prompt,
        imageData,
        maskData,
      });
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : "Unknown error during inpainting";

      // Log usage even on failure
      await db.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        operation: "inpaint",
        model: "imagen-3.0-capability-001",
        provider: "vertex-ai",
        creditsCharged: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      return errors.internal(c, errorMessage);
    }

    // Upload to R2
    const imageKey = r2Service.generateImageKey(session.user.id, projectId);
    let uploadResult: UploadResult;

    try {
      uploadResult = await r2Service.upload({
        key: imageKey,
        data: inpaintResult.imageData,
        contentType: inpaintResult.mimeType,
        metadata: {
          userId: session.user.id,
          projectId,
          prompt,
          operation: "inpaint",
        },
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to upload image";

      // Log usage even on upload failure
      await db.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        operation: "inpaint",
        model: "imagen-3.0-capability-001",
        provider: "vertex-ai",
        creditsCharged: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      return errors.internal(c, "Failed to save inpainted image");
    }

    // Atomic transaction: deduct credits + create records
    const result = await db.transaction(async (tx) => {
      // Deduct credits
      await tx
        .update(user)
        .set({
          credits: userRecord.credits - creditsRequired,
        })
        .where(eq(user.id, session.user.id));

      // Create AI image record
      const [imageRecord] = await tx
        .insert(aiImages)
        .values({
          projectId,
          userId: session.user.id,
          prompt,
          model: "imagen-3.0-capability-001",
          aspectRatio: "1:1", // Inpainted images keep original aspect ratio
          r2Key: imageKey,
          r2Url: uploadResult.url,
          width: inpaintResult.width,
          height: inpaintResult.height,
          fileSize: uploadResult.size,
          mimeType: inpaintResult.mimeType,
          creditsUsed: creditsRequired,
          status: "completed",
        })
        .returning();

      // Create usage history record
      await tx.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        imageId: imageRecord.id,
        operation: "inpaint",
        model: "imagen-3.0-capability-001",
        provider: "vertex-ai",
        creditsCharged: creditsRequired,
        durationMs: inpaintResult.durationMs,
        success: true,
      });

      return imageRecord;
    });

    return ok(
      c,
      {
        image: result,
        creditsUsed: creditsRequired,
        creditsRemaining: userRecord.credits - creditsRequired,
      },
      201,
    );
  })

  /**
   * GET /ai-images/project/:id
   * List all images in a project
   */
  .get(
    "/project/:id",
    zValidator("param", projectIdSchema),
    zValidator("query", generationHistorySchema),
    async (c) => {
      const session = await getSessionOrMock(c);
      if (!session) {
        return errors.unauthorized(c);
      }

      const { id: projectId } = c.req.valid("param");
      const { page, limit } = c.req.valid("query");
      const offset = (page - 1) * limit;

      // Check project access
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
      });

      if (!project) {
        return errors.notFound(c, "Project not found");
      }

      if (project.userId !== session.user.id && !project.isPublic) {
        return errors.forbidden(c);
      }

      // Get images
      const images = await db.query.aiImages.findMany({
        where: eq(aiImages.projectId, projectId),
        limit,
        offset,
        orderBy: [desc(aiImages.createdAt)],
      });

      return ok(c, {
        images,
        pagination: { page, limit },
      });
    },
  )

  /**
   * GET /ai-images/history
   * Get user's generation history across all projects
   */
  .get("/history", zValidator("query", generationHistorySchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const { page, limit, projectId } = c.req.valid("query");
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = projectId
      ? and(eq(aiImages.userId, session.user.id), eq(aiImages.projectId, projectId))
      : eq(aiImages.userId, session.user.id);

    const images = await db.query.aiImages.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(aiImages.createdAt)],
      with: {
        project: {
          columns: { id: true, name: true },
        },
      },
    });

    return ok(c, {
      images,
      pagination: { page, limit },
    });
  });

export default aiImagesRoute;
