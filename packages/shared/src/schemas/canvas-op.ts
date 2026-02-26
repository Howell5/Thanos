import { z } from "zod";

/**
 * Canvas shape instruction — describes a shape the agent wants to add to the canvas.
 * Sent over SSE as a canvas_add_shape event, consumed by the frontend to create tldraw shapes.
 */
export const canvasShapeInstructionSchema = z.discriminatedUnion("shapeType", [
  z.object({
    shapeType: z.literal("text"),
    content: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    fontSize: z.number().optional(),
    width: z.number().optional(),
  }),
  z.object({
    shapeType: z.literal("frame"),
    label: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    /** Shape IDs to reparent into this frame after creation */
    childShapeIds: z.array(z.string()).optional(),
  }),
  z.object({
    shapeType: z.literal("image"),
    url: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    altText: z.string().optional(),
    /** Pre-computed description — skips the async AI describe flow */
    description: z.string().optional(),
    /** Pre-assigned tldraw shape ID (without "shape:" prefix). If provided, frontend will use this ID. */
    shapeId: z.string().optional(),
    /** Placement hint for batch/edit image placement */
    placementHint: z
      .object({
        /** Group ID for batch placement (images in same group placed in a row) */
        group: z.string().optional(),
        /** Shape ID of the reference image (for edit placement — anchor near this shape) */
        referenceShapeId: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    shapeType: z.literal("video"),
    url: z.string(),
    fileName: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  z.object({
    shapeType: z.literal("file"),
    url: z.string(),
    fileName: z.string(),
    mimeType: z.string().optional(),
  }),
  z.object({
    shapeType: z.literal("audio"),
    url: z.string(),
    fileName: z.string().optional(),
    duration: z.number().optional(),
  }),
]);

export type CanvasShapeInstruction = z.infer<typeof canvasShapeInstructionSchema>;

// ─── move_shapes ─────────────────────────────────────────────

export const moveShapeOpSchema = z
  .object({
    shapeId: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    dx: z.number().optional(),
    dy: z.number().optional(),
  })
  .refine((op) => op.x != null || op.y != null || op.dx != null || op.dy != null, {
    message: "At least one of x, y, dx, or dy must be provided",
  });

export const moveShapesPayloadSchema = z.object({
  ops: z.array(moveShapeOpSchema).min(1).max(200),
});

export type MoveShapeOp = z.infer<typeof moveShapeOpSchema>;
export type MoveShapesPayload = z.infer<typeof moveShapesPayloadSchema>;

// ─── resize_shapes ───────────────────────────────────────────

export const resizeShapeOpSchema = z
  .object({
    shapeId: z.string(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    scale: z.number().positive().optional(),
  })
  .refine((op) => op.width != null || op.height != null || op.scale != null, {
    message: "At least one of width, height, or scale must be provided",
  });

export const resizeShapesPayloadSchema = z.object({
  ops: z.array(resizeShapeOpSchema).min(1).max(200),
});

export type ResizeShapeOp = z.infer<typeof resizeShapeOpSchema>;
export type ResizeShapesPayload = z.infer<typeof resizeShapesPayloadSchema>;

// ─── update_shape_meta ───────────────────────────────────────

export const updateShapeMetaOpSchema = z.object({
  shapeId: z.string(),
  meta: z.record(z.unknown()),
});

export const updateShapeMetaPayloadSchema = z.object({
  ops: z.array(updateShapeMetaOpSchema).min(1).max(200),
});

export type UpdateShapeMetaOp = z.infer<typeof updateShapeMetaOpSchema>;
export type UpdateShapeMetaPayload = z.infer<typeof updateShapeMetaPayloadSchema>;
