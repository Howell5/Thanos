/**
 * AI Image Generation Route
 * POST /ai-images/generate
 */

import { zValidator } from "@hono/zod-validator";
import { generateImageSchema } from "@repo/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { aiImages, aiUsageHistory, user } from "../../db/schema";
import type { GenerateImageResult, GenerateMultipleImagesResult } from "../../lib/gemini-ai";
import { getSessionOrMock } from "../../lib/mock-session";
import type { UploadResult } from "../../lib/r2";
import { errors, ok } from "../../lib/response";
import "../../services/types";
import {
  DEFAULT_MODEL,
  checkAIRateLimit,
  checkUserCredits,
  logUsageFailure,
  verifyProjectAccess,
} from "./helpers";

const generateRoute = new Hono().post(
  "/",
  zValidator("json", generateImageSchema),
  async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const geminiService = c.var.geminiService;
    const r2Service = c.var.r2Service;

    if (!geminiService.isConfigured()) {
      return errors.serviceUnavailable(c, "AI image generation is not configured");
    }

    const data = c.req.valid("json");
    const { projectId, prompt, negativePrompt, aspectRatio, model, numberOfImages, referenceImages } = data;

    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    const operation = hasReferenceImages ? "image-to-image" : "text-to-image";
    const usedModel = model || DEFAULT_MODEL;
    const imageCount = numberOfImages || 1;

    // Rate limiting
    const rateLimitError = checkAIRateLimit(c, session.user.id);
    if (rateLimitError) return rateLimitError;

    // Verify project access
    const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
    if (projectError) return projectError;

    // Check credits
    const creditsRequired = geminiService.estimateCredits({ prompt, model, numberOfImages: imageCount });
    const { error: creditsError, userRecord } = await checkUserCredits(c, session.user.id, creditsRequired);
    if (creditsError || !userRecord) return creditsError;

    // Generate images
    const startTime = Date.now();
    let generateResult: GenerateMultipleImagesResult;

    try {
      generateResult = await geminiService.generateImages({
        prompt,
        negativePrompt,
        model,
        aspectRatio,
        numberOfImages: imageCount,
        referenceImages,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error during image generation";
      await logUsageFailure({
        userId: session.user.id,
        projectId,
        operation,
        model: usedModel,
        durationMs: Date.now() - startTime,
        errorMessage,
      });
      return errors.internal(c, errorMessage);
    }

    // Upload images to R2
    const uploadResults: { image: GenerateImageResult; upload: UploadResult; key: string }[] = [];

    for (const image of generateResult.images) {
      const imageKey = r2Service.generateImageKey(session.user.id, projectId);
      try {
        const uploadResult = await r2Service.upload({
          key: imageKey,
          data: image.imageData,
          contentType: image.mimeType,
          metadata: { userId: session.user.id, projectId, prompt },
        });
        uploadResults.push({ image, upload: uploadResult, key: imageKey });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to upload image";
        await logUsageFailure({
          userId: session.user.id,
          projectId,
          operation,
          model: usedModel,
          durationMs: Date.now() - startTime,
          errorMessage,
        });
        return errors.internal(c, "Failed to save generated image");
      }
    }

    // Calculate credits and save to database
    const actualCreditsUsed = (usedModel.includes("flash") ? 50 : 100) * uploadResults.length;

    const imageRecords = await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({ credits: userRecord.credits - actualCreditsUsed })
        .where(eq(user.id, session.user.id));

      const records = [];
      for (const { image, upload, key } of uploadResults) {
        const [imageRecord] = await tx
          .insert(aiImages)
          .values({
            projectId,
            userId: session.user.id,
            prompt,
            negativePrompt,
            model: usedModel,
            aspectRatio: aspectRatio || "1:1",
            r2Key: key,
            r2Url: upload.url,
            width: image.width,
            height: image.height,
            fileSize: upload.size,
            mimeType: image.mimeType,
            creditsUsed: usedModel.includes("flash") ? 50 : 100,
            status: "completed",
          })
          .returning();
        records.push(imageRecord);
      }

      await tx.insert(aiUsageHistory).values({
        userId: session.user.id,
        projectId,
        imageId: records[0].id,
        operation,
        model: usedModel,
        provider: "gemini",
        creditsCharged: actualCreditsUsed,
        durationMs: generateResult.totalDurationMs,
        success: true,
      });

      return records;
    });

    // Return single image for backwards compatibility
    if (imageRecords.length === 1) {
      return ok(c, {
        image: imageRecords[0],
        creditsUsed: actualCreditsUsed,
        creditsRemaining: userRecord.credits - actualCreditsUsed,
      }, 201);
    }

    return ok(c, {
      images: imageRecords,
      creditsUsed: actualCreditsUsed,
      creditsRemaining: userRecord.credits - actualCreditsUsed,
    }, 201);
  },
);

export default generateRoute;
