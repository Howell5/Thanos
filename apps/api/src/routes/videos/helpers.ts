/**
 * Videos Route Helpers
 * Common utilities and validation functions for video routes
 */

import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../../db";
import { projects, videos } from "../../db/schema";
import { errors } from "../../lib/response";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface Session {
  user: SessionUser;
}

/**
 * Verify project ownership and return project
 * Returns error response if project not found or access denied
 */
export async function verifyProjectAccess(c: Context, projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
  });

  if (!project) {
    return { error: errors.notFound(c, "Project not found"), project: null };
  }

  if (project.userId !== userId) {
    return { error: errors.forbidden(c, "You don't have access to this project"), project: null };
  }

  return { error: null, project };
}

/**
 * Verify video ownership and return video
 * Returns error response if video not found or access denied
 */
export async function verifyVideoAccess(c: Context, videoId: string, userId: string) {
  const video = await db.query.videos.findFirst({
    where: eq(videos.id, videoId),
  });

  if (!video) {
    return { error: errors.notFound(c, "Video not found"), video: null };
  }

  if (video.userId !== userId) {
    return { error: errors.forbidden(c, "You don't have access to this video"), video: null };
  }

  return { error: null, video };
}
