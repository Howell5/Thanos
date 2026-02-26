/**
 * POST /api/videos - Create video record
 * Called after video upload to R2, creates DB record and triggers analysis
 */

import { zValidator } from "@hono/zod-validator";
import { createVideoSchema } from "@repo/shared";
import { Hono } from "hono";
import { db } from "../../db";
import { videos } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { triggerShapeDescribe } from "../../services/shape-describe.service";
import { triggerVideoAnalysis } from "../../services/video-analysis.service";
import { verifyProjectAccess } from "./helpers";

const createRoute = new Hono().post("/", zValidator("json", createVideoSchema), async (c) => {
  // Check authentication (supports mock session in development)
  const session = await getSessionOrMock(c);
  if (!session) {
    return errors.unauthorized(c);
  }

  const data = c.req.valid("json");
  const userId = session.user.id;

  // Verify project access
  const { error: projectError } = await verifyProjectAccess(c, data.projectId, userId);
  if (projectError) {
    return projectError;
  }

  // Create video record
  const [video] = await db
    .insert(videos)
    .values({
      projectId: data.projectId,
      userId,
      r2Key: data.r2Key,
      r2Url: data.r2Url,
      originalFileName: data.originalFileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      width: data.width,
      height: data.height,
      duration: data.duration,
      analysisStatus: "pending",
    })
    .returning({ id: videos.id, analysisStatus: videos.analysisStatus });

  // Trigger async analysis task
  triggerVideoAnalysis(video.id);

  // Trigger shape describe if shapeId provided
  if (data.shapeId) {
    triggerShapeDescribe({
      shapeId: data.shapeId,
      projectId: data.projectId,
      userId,
      assetUrl: data.r2Url,
      mediaType: "video",
      mimeType: data.mimeType,
      originalFileName: data.originalFileName,
    });
  }

  return ok(c, { id: video.id, analysisStatus: video.analysisStatus }, 201);
});

export default createRoute;
