/**
 * Canvas Tools MCP Server
 *
 * Unified MCP server for all canvas and video operations.
 * Replaces the old video-tools server with canvas read/write tools
 * plus all existing video tools.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import { videos } from "../../../db/schema";
import { type ClipWithVideo, searchClipsWithLLM } from "../../../services/clip-search.service";
import { analyzeVideoAndWait } from "../../../services/video-analysis.service";
import { createEditingPlanTool } from "../editing-plan-tool";
import { createRenderVideoTool } from "../render-video-tool";
import { syncCanvasVideosToDb } from "../sync-canvas-videos";
import {
  createMoveShapesTool,
  createResizeShapesTool,
  createUpdateShapeMetaTool,
} from "./canvas-mutate-tools";
import { createGetShapeTool, createListShapesTool } from "./canvas-read-tools";
import {
  type CanvasToolsEmitter,
  createAddShapeTool,
  createCanvasToolsEmitter,
} from "./canvas-write-tools";

export { createCanvasToolsEmitter, type CanvasToolsEmitter };

export function createCanvasToolsServer(
  projectId: string,
  userId: string,
  emitter: CanvasToolsEmitter,
) {
  return createSdkMcpServer({
    name: "canvas-tools",
    version: "1.0.0",
    tools: [
      // Canvas read tools
      createListShapesTool(projectId, userId),
      createGetShapeTool(projectId, userId),
      // Canvas write tools
      createAddShapeTool(emitter),
      // Canvas mutation tools
      createMoveShapesTool(emitter),
      createResizeShapesTool(emitter),
      createUpdateShapeMetaTool(emitter),
      // Video tools (migrated from video-tools.ts)
      createListProjectVideosTool(projectId, userId),
      createSearchVideoClipsTool(projectId),
      createGetVideoClipsTool(projectId),
      createEditingPlanTool(projectId, userId),
      createRenderVideoTool(projectId),
      createAnalyzeVideoTool(projectId),
    ],
  });
}

export const CANVAS_TOOL_NAMES = [
  "mcp__canvas-tools__list_shapes",
  "mcp__canvas-tools__get_shape",
  "mcp__canvas-tools__add_shape",
  "mcp__canvas-tools__move_shapes",
  "mcp__canvas-tools__resize_shapes",
  "mcp__canvas-tools__update_shape_meta",
  "mcp__canvas-tools__list_project_videos",
  "mcp__canvas-tools__search_video_clips",
  "mcp__canvas-tools__get_video_clips",
  "mcp__canvas-tools__create_editing_plan",
  "mcp__canvas-tools__render_video",
  "mcp__canvas-tools__analyze_video",
];

// ─── Video Tools (migrated from video-tools.ts) ─────────────

function createListProjectVideosTool(projectId: string, userId: string) {
  return tool(
    "list_project_videos",
    "List all videos in the current project with their analysis status and clip counts",
    {
      status: z
        .enum(["all", "pending", "analyzing", "done", "failed"])
        .default("all")
        .describe("Filter by analysis status"),
    },
    async (args) => {
      try {
        let videoList = await db.query.videos.findMany({
          where:
            args.status === "all"
              ? eq(videos.projectId, projectId)
              : and(eq(videos.projectId, projectId), eq(videos.analysisStatus, args.status)),
          with: { clips: true },
          orderBy: (videos, { desc }) => [desc(videos.createdAt)],
        });

        let syncInfo: string | undefined;
        if (videoList.length === 0) {
          const syncResult = await syncCanvasVideosToDb(projectId, userId);
          if (syncResult.synced > 0) {
            syncInfo = `Auto-synced ${syncResult.synced} video(s) from canvas (skipped: ${syncResult.skipped}, errors: ${syncResult.errors}). Analysis has been triggered.`;
            videoList = await db.query.videos.findMany({
              where:
                args.status === "all"
                  ? eq(videos.projectId, projectId)
                  : and(
                      eq(videos.projectId, projectId),
                      eq(videos.analysisStatus, args.status),
                    ),
              with: { clips: true },
              orderBy: (videos, { desc }) => [desc(videos.createdAt)],
            });
          }
        }

        const summary = videoList.map((v) => ({
          videoId: v.id,
          fileName: v.originalFileName,
          status: v.analysisStatus,
          clipCount: v.clips.length,
          duration: v.duration,
          analyzedAt: v.analyzedAt?.toISOString() || null,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  projectId,
                  totalVideos: summary.length,
                  ...(syncInfo ? { syncInfo } : {}),
                  videos: summary,
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
              text: `Error listing videos: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function createSearchVideoClipsTool(projectId: string) {
  return tool(
    "search_video_clips",
    "Search for video clips that match a natural language query. Uses AI to find the most relevant clips.",
    {
      query: z.string().min(1).describe("Natural language description of the clips"),
      videoIds: z.array(z.string().uuid()).optional().describe("Limit search to specific videos"),
      subjects: z.array(z.string()).optional().describe("Filter by subjects in clips"),
      maxDuration: z.number().positive().optional().describe("Max clip duration in seconds"),
      limit: z.number().min(1).max(20).default(10).describe("Max results"),
    },
    async (args) => {
      try {
        const videoConditions = [
          eq(videos.projectId, projectId),
          eq(videos.analysisStatus, "done"),
        ];
        if (args.videoIds?.length) {
          videoConditions.push(inArray(videos.id, args.videoIds));
        }

        const videoList = await db.query.videos.findMany({
          where: and(...videoConditions),
          with: { clips: true },
        });

        if (videoList.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ reasoning: "No analyzed videos found", matchedClips: [] }),
              },
            ],
          };
        }

        const allClips: ClipWithVideo[] = [];
        for (const video of videoList) {
          for (const clip of video.clips) {
            if (args.subjects?.length) {
              const clipSubjects = (clip.subjects ?? []).map((s) => s.toLowerCase());
              const hasMatch = args.subjects.some((s) =>
                clipSubjects.some((cs) => cs.includes(s.toLowerCase())),
              );
              if (!hasMatch) continue;
            }
            if (args.maxDuration && clip.endTime - clip.startTime > args.maxDuration) continue;
            allClips.push({
              clipId: clip.id,
              videoId: video.id,
              videoFileName: video.originalFileName,
              videoUrl: video.r2Url,
              timeRange: clip.timeRange,
              startTime: clip.startTime,
              endTime: clip.endTime,
              content: clip.content,
              subjects: clip.subjects ?? [],
              actions: clip.actions ?? [],
              scene: clip.scene,
              shotType: clip.shotType,
              camera: clip.camera,
              audio: clip.audio,
              textOnScreen: clip.textOnScreen,
              mood: clip.mood,
            });
          }
        }

        if (allClips.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ reasoning: "No clips match the specified filters", matchedClips: [] }),
              },
            ],
          };
        }

        const searchResult = await searchClipsWithLLM(args.query, allClips, args.limit);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(searchResult, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching clips: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function createGetVideoClipsTool(projectId: string) {
  return tool(
    "get_video_clips",
    "Get detailed information about a specific video and all its analyzed clips",
    {
      videoId: z.string().uuid().describe("The ID of the video"),
    },
    async (args) => {
      try {
        const video = await db.query.videos.findFirst({
          where: and(eq(videos.id, args.videoId), eq(videos.projectId, projectId)),
          with: { clips: true },
        });

        if (!video) {
          return {
            content: [{ type: "text" as const, text: "Video not found or not accessible" }],
            isError: true,
          };
        }

        const result = {
          videoId: video.id,
          fileName: video.originalFileName,
          url: video.r2Url,
          duration: video.duration,
          dimensions: video.width && video.height ? `${video.width}x${video.height}` : null,
          analysisStatus: video.analysisStatus,
          analysisRequest: video.analysisRequest,
          analysisError: video.analysisError,
          analyzedAt: video.analyzedAt?.toISOString() || null,
          clips: video.clips.map((c) => ({
            clipId: c.id,
            timeRange: c.timeRange,
            startTime: c.startTime,
            endTime: c.endTime,
            content: c.content,
            subjects: c.subjects ?? [],
            actions: c.actions ?? [],
            scene: c.scene,
            shotType: c.shotType,
            camera: c.camera,
            audio: c.audio,
            textOnScreen: c.textOnScreen,
            mood: c.mood,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting video: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

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
