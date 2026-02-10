/**
 * Editing Plans Route Helpers
 * Common utilities for editing plan routes
 */

import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../../db";
import { editingPlans, projects } from "../../db/schema";
import { errors } from "../../lib/response";

/**
 * Verify editing plan access: plan exists and user owns the project
 */
export async function verifyPlanAccess(c: Context, planId: string, userId: string) {
  const plan = await db.query.editingPlans.findFirst({
    where: eq(editingPlans.id, planId),
    with: { project: true },
  });

  if (!plan) {
    return { error: errors.notFound(c, "Editing plan not found"), plan: null };
  }

  if (plan.project.userId !== userId) {
    return { error: errors.forbidden(c, "You don't have access to this editing plan"), plan: null };
  }

  return { error: null, plan };
}

/**
 * Verify project ownership (reused from video helpers pattern)
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
