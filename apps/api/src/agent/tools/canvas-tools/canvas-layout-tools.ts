/**
 * Canvas layout tools: organize_shapes, create_frame
 * High-level composite tools that compute layout and emit events.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { loadProjectStore } from "./canvas-helpers";
import type { ShapeRefMap } from "./canvas-refs";
import type { CanvasToolsEmitter } from "./canvas-write-tools";

const MAX_ROW_WIDTH = 2000;

// ─── organize_shapes ────────────────────────────────────────

export function createOrganizeShapesTool(
  projectId: string,
  userId: string,
  emitter: CanvasToolsEmitter,
  refs: ShapeRefMap,
) {
  return tool(
    "organize_shapes",
    `Server-side bulk layout — reads shapes, groups them, computes grid positions, and moves them in one operation. Much more efficient than manually calling move_shapes for each shape.

Strategies:
- "grid": Arrange all shapes in a simple grid
- "by-type": Group shapes by type (image, text, geo, etc.)
- "by-metadata": Group by a metadata field (e.g. model, prompt)
- "by-spatial-cluster": Keep existing spatial clusters but tidy them into grids

Returns a summary of groups created and shapes moved.`,
    {
      strategy: z
        .enum(["grid", "by-type", "by-metadata", "by-spatial-cluster"])
        .describe("How to group shapes before arranging them"),
      groupField: z
        .string()
        .optional()
        .describe("For 'by-metadata' strategy: which meta key to group by (e.g. 'model', 'prompt')"),
      spacing: z
        .number()
        .default(40)
        .describe("Gap between shapes in px"),
      groupSpacing: z
        .number()
        .default(120)
        .describe("Gap between groups in px"),
      origin: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("Top-left origin for the arranged layout. Defaults to current canvas bounds origin."),
      shapeIds: z
        .array(z.string())
        .optional()
        .describe("Subset of shape refs or IDs to organize. Omit to organize all shapes."),
      addLabels: z
        .boolean()
        .default(true)
        .describe("Whether to add text label shapes above each group"),
    },
    async (args) => {
      try {
        const { shapes } = await loadProjectStore(projectId, userId);

        // Filter to subset if specified
        let targetShapes = shapes;
        if (args.shapeIds?.length) {
          const resolvedIds = new Set(args.shapeIds.map((id) => refs.resolve(id)));
          targetShapes = shapes.filter((s) => resolvedIds.has(s.id));
        }

        if (targetShapes.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "No shapes to organize" }) }],
            isError: true,
          };
        }

        // Group shapes by strategy
        const groups = groupShapes(targetShapes, args.strategy, args.groupField);

        // Sort groups alphabetically
        const sortedKeys = Object.keys(groups).sort();

        // Compute origin
        let originX = args.origin?.x ?? Infinity;
        let originY = args.origin?.y ?? Infinity;
        if (!args.origin) {
          for (const s of targetShapes) {
            originX = Math.min(originX, s.x);
            originY = Math.min(originY, s.y);
          }
        }

        // Layout groups
        let cursorY = originY;
        const moveOps: Array<{ shapeId: string; x: number; y: number }> = [];
        const groupResults: Array<{ label: string; shapeCount: number }> = [];
        let totalLabelsAdded = 0;

        for (const groupKey of sortedKeys) {
          const groupShapeList = groups[groupKey];
          if (groupShapeList.length === 0) continue;

          // Add group label
          if (args.addLabels && args.strategy !== "grid") {
            emitter.emit("add_shape", {
              shapeType: "text",
              content: groupKey,
              x: originX,
              y: cursorY,
              fontSize: 36,
              width: 600,
            });
            totalLabelsAdded++;
            cursorY += 60;
          }

          // Arrange shapes in rows within this group
          let rowX = originX;
          let rowMaxH = 0;

          for (const shape of groupShapeList) {
            const w = typeof shape.props.w === "number" ? shape.props.w : 300;
            const h = typeof shape.props.h === "number" ? shape.props.h : 300;

            // Wrap to next row if exceeding max width
            if (rowX > originX && rowX + w > originX + MAX_ROW_WIDTH) {
              cursorY += rowMaxH + args.spacing;
              rowX = originX;
              rowMaxH = 0;
            }

            moveOps.push({ shapeId: shape.id, x: rowX, y: cursorY });
            rowX += w + args.spacing;
            rowMaxH = Math.max(rowMaxH, h);
          }

          cursorY += rowMaxH + args.groupSpacing;
          groupResults.push({ label: groupKey, shapeCount: groupShapeList.length });
        }

        // Emit all moves at once
        if (moveOps.length > 0) {
          emitter.emit("move_shapes", { ops: moveOps });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                totalMoved: moveOps.length,
                totalLabelsAdded,
                groups: groupResults,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error organizing shapes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function groupShapes(
  shapes: Array<{ id: string; type: string; x: number; y: number; props: Record<string, unknown>; meta?: Record<string, unknown> }>,
  strategy: string,
  groupField: string | undefined,
): Record<string, typeof shapes> {
  const groups: Record<string, typeof shapes> = {};

  for (const shape of shapes) {
    let key: string;
    switch (strategy) {
      case "grid":
        key = "all";
        break;
      case "by-type":
        key = shape.type;
        break;
      case "by-metadata": {
        const meta = shape.meta as Record<string, unknown> | undefined;
        key = String(meta?.[groupField ?? "model"] ?? "unknown");
        break;
      }
      case "by-spatial-cluster": {
        // Simple grid clustering: 500px cells
        const gx = Math.floor(shape.x / 500);
        const gy = Math.floor(shape.y / 500);
        key = `cluster (${gx},${gy})`;
        break;
      }
      default:
        key = "all";
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(shape);
  }

  return groups;
}

// ─── create_frame ───────────────────────────────────────────

export function createFrameTool(
  projectId: string,
  userId: string,
  emitter: CanvasToolsEmitter,
  refs: ShapeRefMap,
) {
  return tool(
    "create_frame",
    `Create a tldraw frame that visually encloses specified shapes. Frames are labeled rectangles that group related content on the canvas — like a titled section or category boundary.

Use this after organizing shapes to add visual structure. The frame automatically sizes to enclose all specified shapes with padding.`,
    {
      label: z.string().describe("Frame title/name displayed at the top"),
      shapeIds: z
        .array(z.string())
        .min(1)
        .describe("Shape refs or IDs to enclose in the frame"),
      padding: z
        .number()
        .default(40)
        .describe("Padding in px around the enclosed shapes"),
    },
    async (args) => {
      try {
        const { shapes } = await loadProjectStore(projectId, userId);

        const resolvedIds = new Set(args.shapeIds.map((id) => refs.resolve(id)));
        const targetShapes = shapes.filter((s) => resolvedIds.has(s.id));

        if (targetShapes.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "No matching shapes found" }) }],
            isError: true,
          };
        }

        // Compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of targetShapes) {
          const w = typeof s.props.w === "number" ? s.props.w : 300;
          const h = typeof s.props.h === "number" ? s.props.h : 300;
          minX = Math.min(minX, s.x);
          minY = Math.min(minY, s.y);
          maxX = Math.max(maxX, s.x + w);
          maxY = Math.max(maxY, s.y + h);
        }

        const frameX = minX - args.padding;
        const frameY = minY - args.padding - 32; // Extra space for frame label
        const frameW = maxX - minX + args.padding * 2;
        const frameH = maxY - minY + args.padding * 2 + 32;

        // Pass child IDs so frontend reparents shapes into the frame
        const childShapeIds = targetShapes.map((s) => s.id);

        emitter.emit("add_shape", {
          shapeType: "frame",
          label: args.label,
          x: frameX,
          y: frameY,
          width: frameW,
          height: frameH,
          childShapeIds,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                frameBounds: { x: frameX, y: frameY, w: frameW, h: frameH },
                enclosedCount: targetShapes.length,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating frame: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
