/**
 * Editing Plans - Action Routes
 * POST /editing-plans/confirm - Confirm plan (draft → confirmed)
 * POST /editing-plans/render - Trigger video render
 */

import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { editingPlans } from "../../db/schema";
import { getSessionOrMock } from "../../lib/mock-session";
import { errors, ok } from "../../lib/response";
import { verifyPlanAccess } from "./helpers";

const actionsRoute = new Hono()
  /**
   * POST /editing-plans/confirm
   * Confirm an editing plan (draft → confirmed)
   */
  .post(
    "/confirm",
    zValidator(
      "json",
      z.object({
        planId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const session = await getSessionOrMock(c);
      if (!session) return errors.unauthorized(c);

      const { planId } = c.req.valid("json");

      const { error, plan } = await verifyPlanAccess(c, planId, session.user.id);
      if (error) return error;

      if (plan!.status !== "draft") {
        return errors.badRequest(c, `Cannot confirm plan in "${plan!.status}" status`);
      }

      const [updated] = await db
        .update(editingPlans)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(editingPlans.id, planId))
        .returning();

      return ok(c, updated);
    },
  )

  /**
   * POST /editing-plans/render
   * Trigger video rendering for a confirmed plan
   */
  .post(
    "/render",
    zValidator(
      "json",
      z.object({
        planId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const session = await getSessionOrMock(c);
      if (!session) return errors.unauthorized(c);

      const { planId } = c.req.valid("json");

      const { error, plan } = await verifyPlanAccess(c, planId, session.user.id);
      if (error) return error;

      if (plan!.status === "rendering") {
        return errors.badRequest(c, "Plan is already being rendered");
      }

      if (plan!.status === "done") {
        return ok(c, { status: "done", outputUrl: plan!.outputUrl });
      }

      // Auto-confirm draft plans
      if (plan!.status === "draft") {
        await db
          .update(editingPlans)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(eq(editingPlans.id, planId));
      }

      const videoRenderService = c.var.videoRenderService;
      if (!videoRenderService.isConfigured()) {
        return errors.serviceUnavailable(c, "Video render service is not available");
      }

      const { renderId } = await videoRenderService.startRender(planId);

      return ok(c, { renderId, planId, status: "rendering" });
    },
  );

export default actionsRoute;
