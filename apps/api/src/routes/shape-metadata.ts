/**
 * Shape Metadata Route
 * GET  /api/shape-metadata?shapeId=<id>&projectId=<id>  - single lookup
 * POST /api/shape-metadata/batch                         - batch lookup
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getSessionOrMock } from "../lib/mock-session";
import { errors, ok } from "../lib/response";
import { verifyProjectAccess } from "./videos/helpers";
import {
  batchGetShapeMetadata,
  getShapeMetadataRecord,
  triggerShapeDescribe,
} from "../services/shape-describe.service";

const getSchema = z.object({
  shapeId: z.string().min(1),
  projectId: z.string().uuid(),
});

const batchSchema = z.object({
  projectId: z.string().uuid(),
  shapeIds: z.array(z.string()).min(1).max(100),
});

const triggerSchema = z.object({
  shapeId: z.string().min(1),
  projectId: z.string().uuid(),
  assetUrl: z.string().url(),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string().min(1),
  originalFileName: z.string().optional(),
});

const shapeMetadataRoute = new Hono()
  .get("/", zValidator("query", getSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) return errors.unauthorized(c);

    const { shapeId, projectId } = c.req.valid("query");

    const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
    if (projectError) return projectError;

    const record = await getShapeMetadataRecord(shapeId, projectId);

    if (!record) {
      return ok(c, {
        status: "pending",
        description: null,
        originalFileName: null,
        model: null,
      });
    }

    return ok(c, {
      status: record.status,
      description: record.description ?? null,
      originalFileName: record.originalFileName ?? null,
      model: record.model ?? null,
    });
  })

  .post("/trigger", zValidator("json", triggerSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) return errors.unauthorized(c);

    const data = c.req.valid("json");

    const { error: projectError } = await verifyProjectAccess(c, data.projectId, session.user.id);
    if (projectError) return projectError;

    triggerShapeDescribe({
      ...data,
      userId: session.user.id,
    });

    return ok(c, { triggered: true });
  })

  .post("/batch", zValidator("json", batchSchema), async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) return errors.unauthorized(c);

    const { projectId, shapeIds } = c.req.valid("json");

    const { error: projectError } = await verifyProjectAccess(c, projectId, session.user.id);
    if (projectError) return projectError;

    const rows = await batchGetShapeMetadata(projectId, shapeIds);

    return ok(c, { metadata: rows });
  });

export default shapeMetadataRoute;
