/**
 * Presigned Upload URL Route
 * POST /ai-images/presign - Get presigned URL for direct R2 upload
 * POST /ai-images/confirm - Confirm upload completion and save to database
 *
 * This enables client-side direct upload to R2, bypassing the backend
 * and reducing bandwidth costs.
 */

import { zValidator } from "@hono/zod-validator";
import { confirmUploadSchema, isVideoType, presignUploadSchema } from "@repo/shared";
import { Hono } from "hono";
import { db } from "../../db";
import { aiImages } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import "../../services/types";
import { verifyProjectAccess } from "./helpers";

const presignRoute = new Hono()
  /**
   * Get presigned upload URL
   * Returns a URL that client can use to PUT file directly to R2
   */
  .post("/", zValidator("json", presignUploadSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const r2Service = c.var.r2Service;
    if (!r2Service.isConfigured()) {
      return errors.serviceUnavailable(c, "Image storage is not configured");
    }

    const { projectId, contentType } = c.req.valid("json");

    // Verify project access
    const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
    if (projectError) return projectError;

    // Generate R2 key based on content type
    let key: string;
    if (isVideoType(contentType)) {
      const ext = contentType === "video/webm" ? "webm" : "mp4";
      key = r2Service.generateMediaKey(session.user.id, projectId, ext);
    } else {
      key = r2Service.generateImageKey(session.user.id, projectId);
    }

    try {
      const result = await r2Service.generatePresignedUploadUrl(key, contentType);

      return ok(c, {
        uploadUrl: result.uploadUrl,
        cdnUrl: result.cdnUrl,
        key: result.key,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      console.error("[Presign] Failed to generate presigned URL:", error);
      return errors.internal(c, "Failed to generate upload URL");
    }
  })

  /**
   * Confirm upload completion
   * Called after client successfully uploads to R2
   * Creates database record for the uploaded image
   */
  .post("/confirm", zValidator("json", confirmUploadSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const { projectId, key, filename, contentType, fileSize, width, height } = c.req.valid("json");

    // Verify project access
    const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
    if (projectError) return projectError;

    // Verify the key belongs to this project (security check)
    const validPrefix =
      key.startsWith(`projects/${projectId}/images/`) ||
      key.startsWith(`projects/${projectId}/media/`);
    if (!validPrefix) {
      return errors.forbidden(c, "Invalid upload key for this project");
    }

    // Get CDN URL from key
    const cdnDomain = process.env.R2_CDN_DOMAIN || "img.thanos.art";
    const r2Url = `https://${cdnDomain}/${key}`;

    // Save to database
    const [imageRecord] = await db
      .insert(aiImages)
      .values({
        projectId,
        userId: session.user.id,
        source: "upload",
        originalFileName: filename,
        r2Key: key,
        r2Url,
        width: width ?? 0,
        height: height ?? 0,
        fileSize,
        mimeType: contentType,
        creditsUsed: 0,
        status: "completed",
      })
      .returning();

    return ok(
      c,
      {
        id: imageRecord.id,
        r2Url: imageRecord.r2Url,
        width: imageRecord.width,
        height: imageRecord.height,
        fileSize: imageRecord.fileSize,
        mimeType: imageRecord.mimeType,
        originalFileName: imageRecord.originalFileName,
      },
      201,
    );
  });

export default presignRoute;
