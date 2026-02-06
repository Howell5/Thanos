/**
 * POST /api/videos/search - Search video clips
 * Agent tool endpoint for intelligent clip search
 */

import { zValidator } from "@hono/zod-validator";
import { searchClipsSchema, type SearchClipsResponse } from "@repo/shared";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { videos } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { searchClipsWithLLM, type ClipWithVideo } from "../../services/clip-search.service";
import { verifyProjectAccess } from "./helpers";

const searchRoute = new Hono().post("/search", zValidator("json", searchClipsSchema), async (c) => {
  // Check authentication (supports mock session in development)
  const session = await getSessionOrMock(c);
  if (!session) {
    return errors.unauthorized(c);
  }

  const { projectId, query, videoIds, clipTypes, maxDuration } = c.req.valid("json");
  const userId = session.user.id;

  // Verify project access
  const { error: projectError } = await verifyProjectAccess(c, projectId, userId);
  if (projectError) {
    return projectError;
  }

  // Build video query conditions
  const videoConditions = [eq(videos.projectId, projectId), eq(videos.analysisStatus, "done")];
  if (videoIds?.length) {
    videoConditions.push(inArray(videos.id, videoIds));
  }

  // Fetch videos with clips
  const videoList = await db.query.videos.findMany({
    where: and(...videoConditions),
    with: { clips: true },
  });

  if (videoList.length === 0) {
    return ok(c, {
      reasoning: "No analyzed videos found in this project",
      matchedClips: [],
    } satisfies SearchClipsResponse);
  }

  // Collect and filter clips
  const allClips: ClipWithVideo[] = [];

  for (const video of videoList) {
    for (const clip of video.clips) {
      // Apply filters
      if (clipTypes?.length && !clipTypes.includes(clip.clipType)) {
        continue;
      }
      if (maxDuration && clip.endTime - clip.startTime > maxDuration) {
        continue;
      }
      allClips.push({
        clipId: clip.id,
        videoId: video.id,
        videoFileName: video.originalFileName,
        videoUrl: video.r2Url,
        timeRange: clip.timeRange,
        startTime: clip.startTime,
        endTime: clip.endTime,
        clipType: clip.clipType,
        description: clip.description,
        reason: clip.reason,
      });
    }
  }

  if (allClips.length === 0) {
    return ok(c, {
      reasoning: "No clips match the specified filters",
      matchedClips: [],
    } satisfies SearchClipsResponse);
  }

  // Use LLM for intelligent matching
  const searchResult = await searchClipsWithLLM(query, allClips, 10);

  return ok(c, searchResult);
});

export default searchRoute;
