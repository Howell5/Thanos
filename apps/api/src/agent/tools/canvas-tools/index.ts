/**
 * Canvas Tools MCP Server
 *
 * Unified MCP server for canvas operations: read/write shapes,
 * AI image generation, layout mutations, and video analysis.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import { videos } from "../../../db/schema";
import { analyzeVideoAndWait } from "../../../services/video-analysis.service";
import { createGenerateImageTool } from "./canvas-generate-tool";
import { createFrameTool, createOrganizeShapesTool } from "./canvas-layout-tools";
import {
  createMoveShapesTool,
  createResizeShapesTool,
  createUpdateShapeMetaTool,
} from "./canvas-mutate-tools";
import {
  createGetLayoutSummaryTool,
  createGetShapesTool,
  createListShapesTool,
} from "./canvas-read-tools";
import { ShapeRefMap } from "./canvas-refs";
import {
  type CanvasToolsEmitter,
  createAddShapesTool,
  createCanvasToolsEmitter,
} from "./canvas-write-tools";

export { createCanvasToolsEmitter, type CanvasToolsEmitter };

export function createCanvasToolsServer(
  projectId: string,
  userId: string,
  emitter: CanvasToolsEmitter,
) {
  // Session-scoped ref map shared across all tools
  const refs = new ShapeRefMap();

  return createSdkMcpServer({
    name: "canvas-tools",
    version: "1.0.0",
    tools: [
      // Canvas read tools
      createListShapesTool(projectId, userId, refs),
      createGetShapesTool(projectId, userId, refs),
      createGetLayoutSummaryTool(projectId, userId),
      // Canvas write tools
      createAddShapesTool(emitter),
      // Canvas layout tools
      createOrganizeShapesTool(projectId, userId, emitter, refs),
      createFrameTool(projectId, userId, emitter, refs),
      // AI generation tool
      createGenerateImageTool(projectId, userId, emitter, refs),
      // Canvas mutation tools
      createMoveShapesTool(emitter, refs),
      createResizeShapesTool(emitter, refs),
      createUpdateShapeMetaTool(emitter, refs),
      // Video tools
      createAnalyzeVideoTool(projectId),
    ],
  });
}

export const CANVAS_TOOL_NAMES = [
  "mcp__canvas-tools__list_shapes",
  "mcp__canvas-tools__get_shapes",
  "mcp__canvas-tools__get_layout_summary",
  "mcp__canvas-tools__add_shapes",
  "mcp__canvas-tools__organize_shapes",
  "mcp__canvas-tools__create_frame",
  "mcp__canvas-tools__generate_image",
  "mcp__canvas-tools__move_shapes",
  "mcp__canvas-tools__resize_shapes",
  "mcp__canvas-tools__update_shape_meta",
  "mcp__canvas-tools__analyze_video",
];

// ─── Video Tools ─────────────────────────────────────────────

function createAnalyzeVideoTool(projectId: string) {
  return tool(
    "analyze_video",
    "Analyze a video with AI to extract clip segments. Blocks until analysis is complete.",
    {
      videoId: z.string().uuid().describe("The ID of the video to analyze"),
      analysisRequest: z
        .string()
        .max(2000)
        .optional()
        .describe("Custom analysis prompt (e.g., 'Find all product demo moments')"),
    },
    async (args) => {
      try {
        const video = await db.query.videos.findFirst({
          where: and(eq(videos.id, args.videoId), eq(videos.projectId, projectId)),
        });

        if (!video) {
          return {
            content: [{ type: "text" as const, text: "Video not found or not accessible" }],
            isError: true,
          };
        }

        if (video.analysisStatus === "analyzing") {
          return {
            content: [
              {
                type: "text" as const,
                text: "Video is already being analyzed. Please wait for current analysis to complete.",
              },
            ],
          };
        }

        const result = await analyzeVideoAndWait(args.videoId, args.analysisRequest);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                videoId: args.videoId,
                status: result.status,
                clipCount: result.clipCount,
                ...(result.error ? { error: result.error } : {}),
              }),
            },
          ],
          ...(result.status === "failed" ? { isError: true } : {}),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing video: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
