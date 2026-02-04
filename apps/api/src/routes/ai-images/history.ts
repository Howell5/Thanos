/**
 * AI Images History Routes
 * GET /ai-images/project/:id - List images in a project
 * GET /ai-images/history - Get user's generation history
 */

import { zValidator } from "@hono/zod-validator";
import { generationHistorySchema, projectIdSchema } from "@repo/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { aiImages, projects } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";

const historyRoute = new Hono()
  /**
   * GET /ai-images/project/:id
   * List all images in a project
   */
  .get(
    "/project/:id",
    zValidator("param", projectIdSchema),
    zValidator("query", generationHistorySchema),
    async (c) => {
      const session = await getSessionOrMock(c);
      if (!session) {
        return errors.unauthorized(c);
      }

      const { id: projectId } = c.req.valid("param");
      const { page, limit } = c.req.valid("query");
      const offset = (page - 1) * limit;

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
      });

      if (!project) {
        return errors.notFound(c, "Project not found");
      }

      if (project.userId !== session.user.id && !project.isPublic) {
        return errors.forbidden(c);
      }

      const images = await db.query.aiImages.findMany({
        where: eq(aiImages.projectId, projectId),
        limit,
        offset,
        orderBy: [desc(aiImages.createdAt)],
      });

      return ok(c, { images, pagination: { page, limit } });
    },
  )

  /**
   * GET /ai-images/history
   * Get user's generation history across all projects
   */
  .get("/history", zValidator("query", generationHistorySchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const { page, limit, projectId } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const whereClause = projectId
      ? and(eq(aiImages.userId, session.user.id), eq(aiImages.projectId, projectId))
      : eq(aiImages.userId, session.user.id);

    const images = await db.query.aiImages.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(aiImages.createdAt)],
      with: {
        project: { columns: { id: true, name: true } },
      },
    });

    return ok(c, { images, pagination: { page, limit } });
  });

export default historyRoute;
