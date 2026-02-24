/**
 * Canvas mutation tools: move_shapes, resize_shapes, update_shape_meta
 * Operates on existing shapes via the EventEmitter → SSE → CustomEvent pipeline.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CanvasToolsEmitter } from "./canvas-write-tools";

export function createMoveShapesTool(emitter: CanvasToolsEmitter) {
  return tool(
    "move_shapes",
    `Move one or more shapes on the canvas.

Provide either absolute coordinates (x, y) to place the shape at an exact position,
or relative offsets (dx, dy) to shift from the current position. If both x and dx are
given for the same axis, the absolute coordinate takes precedence.

Use list_shapes first to see current positions and avoid overlaps.`,
    {
      ops: z
        .array(
          z.object({
            shapeId: z.string().describe("tldraw shape ID, e.g. 'shape:abc123'"),
            x: z.number().optional().describe("Absolute target X"),
            y: z.number().optional().describe("Absolute target Y"),
            dx: z.number().optional().describe("Relative X offset added to current position"),
            dy: z.number().optional().describe("Relative Y offset added to current position"),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of move operations"),
    },
    async (args) => {
      try {
        emitter.emit("move_shapes", { ops: args.ops });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, moved: args.ops.length }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
          ],
          isError: true,
        };
      }
    },
  );
}

export function createResizeShapesTool(emitter: CanvasToolsEmitter) {
  return tool(
    "resize_shapes",
    `Resize one or more shapes on the canvas.

Provide either absolute dimensions (width, height) or a scale factor.
If scale is provided, it multiplies both current width and height (width/height are ignored).
Use list_shapes first to see current dimensions.`,
    {
      ops: z
        .array(
          z.object({
            shapeId: z.string().describe("tldraw shape ID"),
            width: z.number().positive().optional().describe("Absolute target width in px"),
            height: z.number().positive().optional().describe("Absolute target height in px"),
            scale: z
              .number()
              .positive()
              .optional()
              .describe("Scale factor (e.g. 2.0 doubles size). Overrides width/height."),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of resize operations"),
    },
    async (args) => {
      try {
        emitter.emit("resize_shapes", { ops: args.ops });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, resized: args.ops.length }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
          ],
          isError: true,
        };
      }
    },
  );
}

export function createUpdateShapeMetaTool(emitter: CanvasToolsEmitter) {
  return tool(
    "update_shape_meta",
    `Update the meta field of one or more shapes.

Meta is a free-form key-value store on each shape. Keys are shallow-merged:
existing keys not mentioned are preserved. Set a key to null to remove it.`,
    {
      ops: z
        .array(
          z.object({
            shapeId: z.string().describe("tldraw shape ID"),
            meta: z
              .record(z.unknown())
              .describe("Key-value pairs to merge into the shape's meta"),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of meta update operations"),
    },
    async (args) => {
      try {
        emitter.emit("update_shape_meta", { ops: args.ops });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, updated: args.ops.length }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
          ],
          isError: true,
        };
      }
    },
  );
}
