/**
 * Canvas read tools: list_shapes and get_shape
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getShapeSummary, loadProjectStore, resolveImageAsset } from "./canvas-helpers";
import { loadProjectShapeMetadata } from "../../../services/shape-describe.service";

export function createListShapesTool(projectId: string, userId: string) {
  return tool(
    "list_shapes",
    "List all shapes currently on the canvas with their type, position, dimensions, and a brief description. Use this to understand what content is on the canvas.",
    {
      type: z
        .enum(["all", "image", "canvas-video", "text", "rich-card", "geo", "arrow", "draw"])
        .default("all")
        .describe("Filter shapes by type. Use 'all' to see everything."),
    },
    async (args) => {
      try {
        const [{ shapes, assets }, metadataMap] = await Promise.all([
          loadProjectStore(projectId, userId),
          loadProjectShapeMetadata(projectId),
        ]);

        const filtered =
          args.type === "all" ? shapes : shapes.filter((s) => s.type === args.type);

        const summaries = filtered.map((s) => getShapeSummary(s, assets, metadataMap));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  projectId,
                  totalShapes: summaries.length,
                  shapes: summaries,
                },
                null,
                2,
              ),
            },
          ],
        };
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

export function createGetShapeTool(projectId: string, userId: string) {
  return tool(
    "get_shape",
    "Get the full details of a specific shape by its ID. For image shapes, this returns the actual image content so you can see what the image looks like.",
    {
      shapeId: z
        .string()
        .describe("The tldraw shape ID (e.g. 'shape:abc123')"),
    },
    async (args) => {
      try {
        const [{ shapes, assets }, metadataMap] = await Promise.all([
          loadProjectStore(projectId, userId),
          loadProjectShapeMetadata(projectId),
        ]);
        const shape = shapes.find((s) => s.id === args.shapeId);

        if (!shape) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Shape not found: ${args.shapeId}`,
              },
            ],
            isError: true,
          };
        }

        // Build content blocks
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        // For image shapes, resolve asset and return actual image content
        if (shape.type === "image") {
          const imageAsset = resolveImageAsset(shape, assets);
          if (imageAsset) {
            const shapeMeta = metadataMap.get(shape.id);
            // Include text metadata (with imageUrl so agent can copy via add_shape)
            content.push({
              type: "text" as const,
              text: JSON.stringify(
                {
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
                },
                null,
                2,
              ),
            });

            // If src is a data URI, extract the base64 and return as image content
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
              // External URL — fetch image and return as base64 so agent can see it
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
                // Fetch failed — fall back to including URL in text metadata
                content[0] = {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
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
                    },
                    null,
                    2,
                  ),
                };
              }
            }
          }
        }

        // For non-image shapes or if image asset wasn't found, return full shape JSON
        if (content.length === 0) {
          const shapeMeta = metadataMap.get(shape.id);
          content.push({
            type: "text" as const,
            text: JSON.stringify(
              {
                ...shape,
                _metadata: shapeMeta
                  ? { fileName: shapeMeta.originalFileName, description: shapeMeta.description }
                  : null,
              },
              null,
              2,
            ),
          });
        }

        return { content };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting shape: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
