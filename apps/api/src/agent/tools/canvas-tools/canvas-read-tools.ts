/**
 * Canvas read tools: list_shapes, get_shapes, get_layout_summary
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getShapeSummary, loadProjectStore, resolveImageAsset } from "./canvas-helpers";
import type { ShapeRefMap } from "./canvas-refs";
import { loadProjectShapeMetadata } from "../../../services/shape-describe.service";

export function createListShapesTool(projectId: string, userId: string, refs: ShapeRefMap) {
  return tool(
    "list_shapes",
    `List shapes on the canvas with type and description.

WORKFLOW for organizing/layout tasks:
1. Start with get_layout_summary for spatial overview
2. Use list_shapes(detail="concise") to see all shape briefs (cheap, no positions)
3. Use organize_shapes for bulk arrangement
4. Use create_frame to visually group related shapes
Only use list_shapes(detail="full") when you need exact positions for manual moves.

Set detail="concise" (default) for a lightweight listing with only ref, type, brief per shape.
Set detail="full" to include x/y/w/h/fileName/description per shape.

Set include_content=true to get actual image content inline (as image blocks). GUARD: include_content is refused if no filter is applied (type='all', no search) and shape count > 30.`,
    {
      type: z
        .enum(["all", "image", "canvas-video", "text", "rich-card", "geo", "arrow", "draw"])
        .default("all")
        .describe("Filter shapes by type. Use 'all' to see everything."),
      search: z
        .string()
        .optional()
        .describe("Search shapes by description, fileName, or brief text. Case-insensitive substring match."),
      groupBy: z
        .enum(["none", "type", "meta.model", "meta.prompt", "spatial-row"])
        .default("none")
        .describe("Group shapes in the output. 'type' groups by shape type. 'meta.model'/'meta.prompt' groups by metadata fields. 'spatial-row' groups shapes that share similar Y coordinates (within 50px)."),
      include_content: z
        .boolean()
        .default(false)
        .describe("If true, include actual image content (as image blocks) for image shapes. Use with filters to keep response size manageable. Max 20 images will have content included."),
      detail: z
        .enum(["concise", "full"])
        .default("concise")
        .describe("'concise' returns only ref, type, brief per shape (default). 'full' includes x/y/w/h/fileName/description."),
    },
    async (args) => {
      try {
        const [{ shapes, assets }, metadataMap] = await Promise.all([
          loadProjectStore(projectId, userId),
          loadProjectShapeMetadata(projectId),
        ]);

        let filtered =
          args.type === "all" ? shapes : shapes.filter((s) => s.type === args.type);

        // Apply search filter
        if (args.search) {
          const query = args.search.toLowerCase();
          filtered = filtered.filter((s) => {
            const summary = getShapeSummary(s, assets, metadataMap);
            return (
              summary.brief.toLowerCase().includes(query) ||
              (summary.fileName?.toLowerCase().includes(query) ?? false) ||
              (summary.description?.toLowerCase().includes(query) ?? false)
            );
          });
        }

        // Hard guard: refuse include_content on unfiltered large sets
        const isUnfiltered = args.type === "all" && !args.search;
        if (args.include_content && isUnfiltered && filtered.length > 30) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `include_content refused: ${filtered.length} shapes with no filter applied. Add a type filter or search to narrow results below 30, or use get_shapes for specific shapes.`,
                  suggestion: "Try list_shapes(type='image', search='...', include_content=true) or use get_shapes with specific refs.",
                }),
              },
            ],
            isError: true,
          };
        }

        // Assign short refs (s1, s2, ...) for all filtered shapes
        refs.assign(filtered.map((s) => s.id));

        const summaries = filtered.map((s) => {
          const summary = getShapeSummary(s, assets, metadataMap);
          const ref = refs.getRef(s.id);
          if (args.detail === "concise") {
            return { ref, type: summary.type, brief: summary.brief };
          }
          return { ref, ...summary };
        });

        // Build type summary line for concise mode
        const typeSummary = buildTypeSummary(filtered);

        // Build content blocks
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        // Group shapes if requested
        let shapesOutput: unknown;
        if (args.groupBy !== "none") {
          const groups: Record<string, typeof summaries> = {};
          for (let i = 0; i < summaries.length; i++) {
            const shape = filtered[i];
            const summary = summaries[i];
            let groupKey: string;

            switch (args.groupBy) {
              case "type":
                groupKey = shape.type;
                break;
              case "meta.model":
                groupKey = String((shape.meta as Record<string, unknown>)?.model ?? "unknown");
                break;
              case "meta.prompt":
                groupKey = String((shape.meta as Record<string, unknown>)?.prompt ?? "unknown");
                break;
              case "spatial-row": {
                const y = shape.y ?? 0;
                const band = Math.round(y / 50) * 50;
                groupKey = `y≈${band}`;
                break;
              }
              default:
                groupKey = "all";
            }

            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(summary);
          }
          shapesOutput = groups;
        } else {
          shapesOutput = summaries;
        }

        content.push({
          type: "text" as const,
          text: JSON.stringify(
            {
              projectId,
              totalShapes: summaries.length,
              ...(args.detail === "concise" ? { summary: typeSummary } : {}),
              ...(args.groupBy !== "none"
                ? { groupBy: args.groupBy, groups: shapesOutput }
                : { shapes: shapesOutput }),
              ...(args.include_content && summaries.length > 20
                ? { _hint: `Only first 20 of ${summaries.length} images include content. Use search or type filter to narrow results.` }
                : {}),
            },
            null,
            2,
          ),
        });

        // Include image content if requested
        if (args.include_content) {
          const imageShapes = filtered.filter((s) => s.type === "image").slice(0, 20);
          for (const shape of imageShapes) {
            const imageAsset = resolveImageAsset(shape, assets);
            if (!imageAsset) continue;

            const ref = refs.getRef(shape.id);
            content.push({
              type: "text" as const,
              text: `[Image: ${ref ?? shape.id}]`,
            });

            if (imageAsset.src.startsWith("data:")) {
              const match = imageAsset.src.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                content.push({
                  type: "image" as const,
                  data: match[2],
                  mimeType: match[1],
                });
              }
            } else {
              try {
                const imageResponse = await fetch(imageAsset.src);
                if (imageResponse.ok) {
                  const buffer = Buffer.from(await imageResponse.arrayBuffer());
                  const mimeType = imageResponse.headers.get("content-type") || imageAsset.mimeType;
                  content.push({
                    type: "image" as const,
                    data: buffer.toString("base64"),
                    mimeType,
                  });
                }
              } catch {
                // Skip failed image fetches
              }
            }
          }
        }

        return { content };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing shapes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function buildTypeSummary(shapes: Array<{ type: string }>): string {
  const counts: Record<string, number> = {};
  for (const s of shapes) {
    counts[s.type] = (counts[s.type] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
}

export function createGetShapesTool(projectId: string, userId: string, refs: ShapeRefMap) {
  return tool(
    "get_shapes",
    `Get full details of one or more shapes by ID or ref. For image shapes, returns actual image content so you can see the image.

BATCH SUPPORT: Pass up to 20 shape IDs or refs to fetch multiple shapes in one call. You can use short refs from list_shapes (e.g. "s1", "s2") or full tldraw IDs (e.g. "shape:abc123").

TIP: If you need to review many images at once, prefer list_shapes with include_content=true instead — it's more efficient for broad visual surveys. Use get_shapes when you need full-resolution details for specific shapes.`,
    {
      shapeIds: z
        .array(z.string().describe("Shape ref (e.g. 's1') or full tldraw ID (e.g. 'shape:abc123')"))
        .min(1)
        .max(20)
        .describe("Array of shape refs or IDs to fetch"),
    },
    async (args) => {
      try {
        const [{ shapes, assets }, metadataMap] = await Promise.all([
          loadProjectStore(projectId, userId),
          loadProjectShapeMetadata(projectId),
        ]);

        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        const notFound: string[] = [];

        for (const rawId of args.shapeIds) {
          const shapeId = refs.resolve(rawId);
          const shape = shapes.find((s) => s.id === shapeId);
          if (!shape) {
            notFound.push(rawId);
            continue;
          }

          // For image shapes, resolve asset and return actual image content
          if (shape.type === "image") {
            const imageAsset = resolveImageAsset(shape, assets);
            if (imageAsset) {
              const shapeMeta = metadataMap.get(shape.id);
              content.push({
                type: "text" as const,
                text: JSON.stringify({
                  id: shape.id,
                  type: shape.type,
                  x: shape.x,
                  y: shape.y,
                  props: { w: shape.props.w, h: shape.props.h, assetId: shape.props.assetId },
                  assetName: imageAsset.name,
                  mimeType: imageAsset.mimeType,
                  imageUrl: imageAsset.src,
                  fileName: shapeMeta?.originalFileName ?? imageAsset.name,
                  description: shapeMeta?.description ?? null,
                }),
              });

              if (imageAsset.src.startsWith("data:")) {
                const match = imageAsset.src.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  content.push({ type: "image" as const, data: match[2], mimeType: match[1] });
                }
              } else {
                try {
                  const imageResponse = await fetch(imageAsset.src);
                  if (imageResponse.ok) {
                    const buffer = Buffer.from(await imageResponse.arrayBuffer());
                    const mimeType = imageResponse.headers.get("content-type") || imageAsset.mimeType;
                    content.push({ type: "image" as const, data: buffer.toString("base64"), mimeType });
                  }
                } catch {
                  // Fetch failed — metadata already included above
                }
              }
              continue;
            }
          }

          // Non-image shapes or image without asset
          const shapeMeta = metadataMap.get(shape.id);
          content.push({
            type: "text" as const,
            text: JSON.stringify({
              ...shape,
              _metadata: shapeMeta
                ? { fileName: shapeMeta.originalFileName, description: shapeMeta.description }
                : null,
            }),
          });
        }

        // Report not-found shapes
        if (notFound.length > 0) {
          content.unshift({
            type: "text" as const,
            text: JSON.stringify({
              _warning: `${notFound.length} shape(s) not found`,
              notFound,
            }),
          });
        }

        if (content.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No shapes found for the given IDs." }],
            isError: true,
          };
        }

        return { content };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting shapes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── get_layout_summary ──────────────────────────────────────

const CELL = 500; // grid cell size for clustering

export function createGetLayoutSummaryTool(projectId: string, userId: string) {
  return tool(
    "get_layout_summary",
    `Cheap spatial overview — no per-shape data. Returns bounds, type counts, spatial clusters, and a suggested origin for new layout. Use FIRST for large canvases.`,
    {},
    async () => {
      try {
        const [{ shapes, assets }, metadataMap] = await Promise.all([
          loadProjectStore(projectId, userId),
          loadProjectShapeMetadata(projectId),
        ]);
        if (shapes.length === 0) {
          return { content: [{ type: "text" as const, text: '{"shapeCount":0,"empty":true}' }] };
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const typeCounts: Record<string, number> = {};
        for (const s of shapes) {
          const w = typeof s.props.w === "number" ? s.props.w : 0;
          const h = typeof s.props.h === "number" ? s.props.h : 0;
          if (s.x < minX) minX = s.x;
          if (s.y < minY) minY = s.y;
          if (s.x + w > maxX) maxX = s.x + w;
          if (s.y + h > maxY) maxY = s.y + h;
          typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
        }

        // Grid-based clustering with flood-fill merge
        const grid = new Map<string, Array<{ x: number; y: number; w: number; h: number; type: string; brief: string }>>();
        for (const s of shapes) {
          const key = `${Math.floor(s.x / CELL)},${Math.floor(s.y / CELL)}`;
          if (!grid.has(key)) grid.set(key, []);
          const brief = getShapeSummary(s, assets, metadataMap).brief;
          const w = typeof s.props.w === "number" ? s.props.w : 0;
          const h = typeof s.props.h === "number" ? s.props.h : 0;
          grid.get(key)!.push({ x: s.x, y: s.y, w, h, type: s.type, brief });
        }

        const visited = new Set<string>();
        const clusters: Array<{ center: { x: number; y: number }; bounds: { minX: number; minY: number; maxX: number; maxY: number }; count: number; types: Record<string, number>; sampleBriefs: string[] }> = [];

        for (const key of grid.keys()) {
          if (visited.has(key)) continue;
          const queue = [key];
          let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
          let count = 0;
          const cTypes: Record<string, number> = {};
          const briefs: string[] = [];

          while (queue.length > 0) {
            const cell = queue.pop()!;
            if (visited.has(cell) || !grid.has(cell)) continue;
            visited.add(cell);
            for (const item of grid.get(cell)!) {
              cMinX = Math.min(cMinX, item.x);
              cMinY = Math.min(cMinY, item.y);
              cMaxX = Math.max(cMaxX, item.x + item.w);
              cMaxY = Math.max(cMaxY, item.y + item.h);
              count++;
              cTypes[item.type] = (cTypes[item.type] || 0) + 1;
              if (briefs.length < 3) briefs.push(item.brief);
            }
            const [cx, cy] = cell.split(",").map(Number);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nb = `${cx + dx},${cy + dy}`;
              if (!visited.has(nb) && grid.has(nb)) queue.push(nb);
            }
          }
          clusters.push({
            center: { x: Math.round((cMinX + cMaxX) / 2), y: Math.round((cMinY + cMaxY) / 2) },
            bounds: { minX: cMinX, minY: cMinY, maxX: cMaxX, maxY: cMaxY },
            count, types: cTypes, sampleBriefs: briefs,
          });
        }
        clusters.sort((a, b) => b.count - a.count);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              shapeCount: shapes.length,
              bounds: { minX, minY, maxX, maxY },
              typeCounts,
              clusters,
              suggestedOrigin: { x: Math.round(maxX + 200), y: Math.round(minY) },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error getting layout summary: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );
}
