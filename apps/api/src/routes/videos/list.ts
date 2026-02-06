/**
 * GET /api/videos - Get project videos list
 * Returns videos with optional clips data
 */

import { zValidator } from "@hono/zod-validator";
import { type VideoClip, type VideoResponse, getProjectVideosSchema } from "@repo/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { type videoClips, videos } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { verifyProjectAccess } from "./helpers";

const listRoute = new Hono().get("/", zValidator("query", getProjectVideosSchema), async (c) => {
  // Check authentication (supports mock session in development)
  const session = await getSessionOrMock(c);
  if (!session) {
    return errors.unauthorized(c);
  }

  const { projectId, includeClips, analysisStatus } = c.req.valid("query");
  const userId = session.user.id;

  // Verify project access
  const { error: projectError } = await verifyProjectAccess(c, projectId, userId);
  if (projectError) {
    return projectError;
  }

  // Build query conditions
  const conditions = [eq(videos.projectId, projectId)];
  if (analysisStatus) {
    conditions.push(eq(videos.analysisStatus, analysisStatus));
  }

  // Fetch videos
  const videoList = await db.query.videos.findMany({
    where: and(...conditions),
    orderBy: (videos, { desc }) => [desc(videos.createdAt)],
    with: includeClips ? { clips: true } : undefined,
  });

  // Transform to response format
  const response: VideoResponse[] = videoList.map((video) => ({
    id: video.id,
    projectId: video.projectId,
    r2Url: video.r2Url,
    originalFileName: video.originalFileName,
    fileSize: video.fileSize,
    mimeType: video.mimeType,
    width: video.width,
    height: video.height,
    duration: video.duration,
    analysisStatus: video.analysisStatus as "pending" | "analyzing" | "done" | "failed",
    analysisError: video.analysisError,
    clips: includeClips
      ? ((video as typeof video & { clips: (typeof videoClips.$inferSelect)[] }).clips || []).map(
          (clip): VideoClip => ({
            id: clip.id,
            videoId: clip.videoId,
            timeRange: clip.timeRange,
            startTime: clip.startTime,
            endTime: clip.endTime,
            content: clip.content,
            subjects: clip.subjects ?? [],
            actions: clip.actions ?? [],
            scene: clip.scene,
            shotType: clip.shotType,
            camera: clip.camera,
            audio: clip.audio,
            textOnScreen: clip.textOnScreen,
            mood: clip.mood,
            createdAt: clip.createdAt.toISOString(),
          }),
        )
      : [],
    createdAt: video.createdAt.toISOString(),
  }));

  return ok(c, { videos: response });
});

export default listRoute;
