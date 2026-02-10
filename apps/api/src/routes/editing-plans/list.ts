/**
 * Editing Plans - List & Get Routes
 * GET /editing-plans?projectId=xxx - List plans for a project
 * GET /editing-plans/:id - Get plan details
 * GET /editing-plans/:id/status - Get render progress
 */

import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { editingPlans } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { verifyPlanAccess, verifyProjectAccess } from "./helpers";

const listRoute = new Hono()
  /**
   * GET /editing-plans?projectId=xxx
   * List editing plans for a project
   */
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        projectId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const session = await getSessionOrMock(c);
      if (!session) return errors.unauthorized(c);

      const { projectId } = c.req.valid("query");

      const { error } = await verifyProjectAccess(c, projectId, session.user.id);
      if (error) return error;

      const plans = await db.query.editingPlans.findMany({
        where: eq(editingPlans.projectId, projectId),
        orderBy: [desc(editingPlans.createdAt)],
      });

      return ok(c, { plans });
    },
  )

  /**
   * GET /editing-plans/:id
   * Get editing plan details
   */
  .get("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) return errors.unauthorized(c);

    const { id } = c.req.valid("param");

    const { error, plan } = await verifyPlanAccess(c, id, session.user.id);
    if (error) return error;

    return ok(c, plan);
  })

  /**
   * GET /editing-plans/:id/status
   * Get render progress for a plan
   */
  .get("/:id/status", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) return errors.unauthorized(c);

    const { id } = c.req.valid("param");

    const { error, plan } = await verifyPlanAccess(c, id, session.user.id);
    if (error) return error;

    // If there's an active render, get progress from the render service
    if (plan!.status === "rendering") {
      // The renderId is stored in-memory by the render service
      // For now, return DB status; future: add renderId to plan table
      return ok(c, {
        status: plan!.status,
        outputUrl: plan!.outputUrl,
        renderError: plan!.renderError,
      });
    }

    return ok(c, {
      status: plan!.status,
      outputUrl: plan!.outputUrl,
      renderError: plan!.renderError,
    });
  });

export default listRoute;
