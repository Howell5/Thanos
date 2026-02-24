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
    shapeType: z.literal("image"),
    url: z.string().url(),
    width: z.number().optional(),
    height: z.number().optional(),
    altText: z.string().optional(),
  }),
  z.object({
    shapeType: z.literal("video"),
    url: z.string().url(),
    fileName: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  z.object({
    shapeType: z.literal("file"),
    url: z.string().url(),
    fileName: z.string(),
    mimeType: z.string().optional(),
  }),
  z.object({
    shapeType: z.literal("audio"),
    url: z.string().url(),
    fileName: z.string().optional(),
    duration: z.number().optional(),
  }),
]);

export type CanvasShapeInstruction = z.infer<typeof canvasShapeInstructionSchema>;
