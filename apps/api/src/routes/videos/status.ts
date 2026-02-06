/**
 * GET /api/videos/:id/status - Get video analysis status
 * Used for polling analysis progress
 */

import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { videoClips } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { verifyVideoAccess } from "./helpers";

const statusRoute = new Hono().get("/:id/status", async (c) => {
  // Check authentication (supports mock session in development)
  const session = await getSessionOrMock(c);
  if (!session) {
    return errors.unauthorized(c);
  }

  const videoId = c.req.param("id");
  const userId = session.user.id;

  // Verify video access
  const { error: videoError, video } = await verifyVideoAccess(c, videoId, userId);
  if (videoError || !video) {
    return videoError;
  }

  // Count clips
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videoClips)
    .where(eq(videoClips.videoId, videoId));

  return ok(c, {
    id: video.id,
    analysisStatus: video.analysisStatus as "pending" | "analyzing" | "done" | "failed",
    analysisError: video.analysisError,
    clipCount: count,
  });
});

export default statusRoute;
