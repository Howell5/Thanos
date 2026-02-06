/**
 * POST /api/videos/:id/analyze - Manually trigger video analysis
 * Used to re-analyze or analyze with custom prompt
 */

import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { videos } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { triggerVideoAnalysis } from "../../services/video-analysis.service";
import { verifyVideoAccess } from "./helpers";

// Body schema for analyze endpoint
const analyzeBodySchema = z.object({
  analysisRequest: z.string().min(1).max(2000).optional(),
});

const analyzeRoute = new Hono().post(
  "/:id/analyze",
  zValidator("json", analyzeBodySchema),
  async (c) => {
    // Check authentication (supports mock session in development)
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const videoId = c.req.param("id");
    const userId = session.user.id;
    const { analysisRequest } = c.req.valid("json");

    // Verify video access
    const { error: videoError, video } = await verifyVideoAccess(c, videoId, userId);
    if (videoError || !video) {
      return videoError;
    }

    // Check if already analyzing
    if (video.analysisStatus === "analyzing") {
      return errors.conflict(c, "Video is already being analyzed");
    }

    // Update status to pending and save analysis request
    await db
      .update(videos)
      .set({
        analysisStatus: "pending",
        analysisRequest: analysisRequest || null,
        analysisError: null,
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId));

    // Trigger async analysis task
    triggerVideoAnalysis(videoId, analysisRequest);

    return ok(c, { message: "Analysis started", videoId });
  },
);

export default analyzeRoute;
