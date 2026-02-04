/**
 * AI Image Inpainting Route
 * POST /ai-images/inpaint
 */

import { zValidator } from "@hono/zod-validator";
import { inpaintImageSchema } from "@repo/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { aiImages, aiUsageHistory, user } from "../../db/schema";
import type { GenerateImageResult } from "../../lib/gemini-ai";
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

const inpaintRoute = new Hono().post("/", zValidator("json", inpaintImageSchema), async (c) => {
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
  const { projectId, prompt, imageData, maskData } = data;

  // Rate limiting
  const rateLimitError = checkAIRateLimit(c, session.user.id);
  if (rateLimitError) return rateLimitError;

  // Verify project access
  const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
  if (projectError) return projectError;

  // Check credits
  const creditsRequired = geminiService.estimateInpaintCredits();
  const { error: creditsError, userRecord } = await checkUserCredits(
    c,
    session.user.id,
    creditsRequired,
    "inpaint",
  );
  if (creditsError || !userRecord) return creditsError;

  // Inpaint image
  const startTime = Date.now();
  let inpaintResult: GenerateImageResult;

  try {
    inpaintResult = await geminiService.inpaintImage({ prompt, imageData, maskData });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error during inpainting";
    await logUsageFailure({
      userId: session.user.id,
      projectId,
      operation: "inpaint",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startTime,
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
      metadata: { userId: session.user.id, projectId, prompt, operation: "inpaint" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to upload image";
    await logUsageFailure({
      userId: session.user.id,
      projectId,
      operation: "inpaint",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startTime,
      errorMessage,
    });
    return errors.internal(c, "Failed to save inpainted image");
  }

  // Save to database
  const result = await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ credits: userRecord.credits - creditsRequired })
      .where(eq(user.id, session.user.id));

    const [imageRecord] = await tx
      .insert(aiImages)
      .values({
        projectId,
        userId: session.user.id,
        prompt,
        model: DEFAULT_MODEL,
        aspectRatio: "1:1",
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

    await tx.insert(aiUsageHistory).values({
      userId: session.user.id,
      projectId,
      imageId: imageRecord.id,
      operation: "inpaint",
      model: DEFAULT_MODEL,
      provider: "gemini",
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
});

export default inpaintRoute;
