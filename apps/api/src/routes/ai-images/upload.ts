/**
 * Image Upload Route
 * POST /ai-images/upload
 *
 * Handles user-uploaded images to R2 storage
 */

import { zValidator } from "@hono/zod-validator";
import {
  ALLOWED_UPLOAD_TYPES,
  getMaxUploadSize,
  isVideoType,
  uploadImageSchema,
} from "@repo/shared";
import { Hono } from "hono";
import { db } from "../../db";
import { aiImages } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import "../../services/types";
import { verifyProjectAccess } from "./helpers";

/**
 * Get image dimensions from buffer
 * Supports PNG and JPEG
 */
function getImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png") {
      // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
      if (buffer.length < 24) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      // JPEG: Search for SOF0 marker (0xFFC0) or SOF2 (0xFFC2)
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }

        const marker = buffer[offset + 1];
        // SOF0 (baseline) or SOF2 (progressive)
        if (marker === 0xc0 || marker === 0xc2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        // Skip to next marker
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
      return null;
    }

    if (mimeType === "image/webp") {
      // WebP: Check for VP8 or VP8L chunk
      if (buffer.length < 30) return null;

      // Check RIFF header
      if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
      if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;

      const chunkType = buffer.toString("ascii", 12, 16);

      if (chunkType === "VP8 ") {
        // Lossy WebP
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }

      if (chunkType === "VP8L") {
        // Lossless WebP
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }

      return null;
    }

    if (mimeType === "image/gif") {
      // GIF: width at bytes 6-7, height at bytes 8-9 (little-endian)
      if (buffer.length < 10) return null;
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validate file type against allowed types (images + videos)
 */
function isAllowedUploadType(mimeType: string): boolean {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(mimeType);
}

const uploadRoute = new Hono().post("/", zValidator("form", uploadImageSchema), async (c) => {
  // Get session
  const session = await getSessionOrMock(c);
  if (!session) {
    return errors.unauthorized(c);
  }

  // Check R2 service availability
  const r2Service = c.var.r2Service;
  if (!r2Service.isConfigured()) {
    return errors.serviceUnavailable(c, "Image storage is not configured");
  }

  // Get form data
  const { projectId } = c.req.valid("form");

  // Get file from request
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    return errors.badRequest(c, "File is required");
  }

  // Validate file type
  if (!isAllowedUploadType(file.type)) {
    return errors.badRequest(
      c,
      `Invalid file type. Allowed types: ${ALLOWED_UPLOAD_TYPES.join(", ")}`,
    );
  }

  // Validate file size (different limits for images vs videos)
  const maxSize = getMaxUploadSize(file.type);
  if (file.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    return errors.badRequest(c, `File size exceeds ${maxSizeMB}MB limit`);
  }

  // Verify project access
  const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
  if (projectError) return projectError;

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Get dimensions: images parsed from buffer, videos default to 0x0
  const isVideo = isVideoType(file.type);
  let dimensions: { width: number; height: number };

  if (isVideo) {
    dimensions = { width: 0, height: 0 };
  } else {
    const imgDimensions = getImageDimensions(buffer, file.type);
    if (!imgDimensions) {
      return errors.badRequest(c, "Could not read image dimensions");
    }
    dimensions = imgDimensions;
  }

  // Generate R2 key based on file type
  let imageKey: string;
  if (isVideo) {
    const ext = file.type === "video/webm" ? "webm" : "mp4";
    imageKey = r2Service.generateMediaKey(session.user.id, projectId, ext);
  } else {
    imageKey = r2Service.generateImageKey(session.user.id, projectId);
  }

  let uploadResult;
  try {
    uploadResult = await r2Service.upload({
      key: imageKey,
      data: buffer,
      contentType: file.type,
      metadata: {
        userId: session.user.id,
        projectId,
        originalFileName: file.name,
      },
    });
  } catch (error) {
    console.error("[Upload] R2 upload failed:", error);
    return errors.internal(c, "Failed to upload image");
  }

  // Save to database
  const [imageRecord] = await db
    .insert(aiImages)
    .values({
      projectId,
      userId: session.user.id,
      source: "upload",
      originalFileName: file.name,
      r2Key: imageKey,
      r2Url: uploadResult.url,
      width: dimensions.width,
      height: dimensions.height,
      fileSize: uploadResult.size,
      mimeType: file.type,
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

export default uploadRoute;
