/**
 * AI Images Route Helpers
 * Common utilities and validation functions for AI image routes
 */

import type { Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { aiUsageHistory, projects, user } from "../../db/schema";
import {
  AI_GENERATION_LIMIT,
  checkRateLimit,
  getAIGenerationRateLimitKey,
} from "../../lib/rate-limit";
import { err, errors } from "../../lib/response";

export const DEFAULT_MODEL = "gemini-2.5-flash-image";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface Session {
  user: SessionUser;
}

/**
 * Check rate limit for AI generation
 * Returns error response if rate limited, null otherwise
 */
export function checkAIRateLimit(c: Context, userId: string) {
  const rateLimit = checkRateLimit(
    getAIGenerationRateLimitKey(userId),
    AI_GENERATION_LIMIT,
  );
  if (rateLimit.limited) {
    return errors.tooManyRequests(
      c,
      "AI generation rate limit exceeded. Please try again later.",
    );
  }
  return null;
}

/**
 * Verify project ownership and return project
 * Returns error response if project not found or access denied
 */
export async function verifyProjectAccess(
  c: Context,
  projectId: string,
  userId: string,
) {
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
 * Check if user has enough credits
 * Returns error response if insufficient, null otherwise with user record
 */
export async function checkUserCredits(
  c: Context,
  userId: string,
  creditsRequired: number,
  operationType: "generate" | "inpaint" = "generate",
) {
  const userRecord = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { credits: true },
  });

  if (!userRecord || userRecord.credits < creditsRequired) {
    const message =
      operationType === "inpaint"
        ? "Insufficient credits to inpaint image"
        : "Insufficient credits to generate image";
    return { error: err(c, 402, message, "INSUFFICIENT_CREDITS"), userRecord: null };
  }

  return { error: null, userRecord };
}

/**
 * Log AI usage to database (for failures)
 */
export async function logUsageFailure(params: {
  userId: string;
  projectId: string;
  operation: string;
  model: string;
  durationMs: number;
  errorMessage: string;
}) {
  await db.insert(aiUsageHistory).values({
    userId: params.userId,
    projectId: params.projectId,
    operation: params.operation,
    model: params.model,
    provider: "gemini",
    creditsCharged: 0,
    durationMs: params.durationMs,
    success: false,
    errorMessage: params.errorMessage,
  });
}
