/**
 * Video Tools MCP Server
 * Provides tools for Agent to interact with video clips
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { videos } from "../../db/schema";
import { searchClipsWithLLM, type ClipWithVideo } from "../../services/clip-search.service";
import { triggerVideoAnalysis } from "../../services/video-analysis.service";

/**
 * Create video tools MCP server for a specific project
 * Each agent session gets its own server instance scoped to a project
 */
export function createVideoToolsServer(projectId: string) {
  return createSdkMcpServer({
    name: "video-tools",
    version: "1.0.0",
    tools: [
      // Tool 1: List all videos in project
      tool(
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
            const videoList = await db.query.videos.findMany({
              where:
                args.status === "all"
                  ? eq(videos.projectId, projectId)
                  : and(eq(videos.projectId, projectId), eq(videos.analysisStatus, args.status)),
              with: { clips: true },
              orderBy: (videos, { desc }) => [desc(videos.createdAt)],
            });

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
      ),

      // Tool 2: Search video clips
      tool(
        "search_video_clips",
        "Search for video clips that match a natural language query. Uses AI to find the most relevant clips based on their descriptions and content.",
        {
          query: z.string().min(1).describe("Natural language description of the clips you're looking for"),
          videoIds: z
            .array(z.string().uuid())
            .optional()
            .describe("Optional: limit search to specific videos"),
          clipTypes: z
            .array(z.string())
            .optional()
            .describe("Optional: filter by clip types (e.g., 'hook', 'product_demo')"),
          maxDuration: z
            .number()
            .positive()
            .optional()
            .describe("Optional: maximum clip duration in seconds"),
          limit: z.number().min(1).max(20).default(10).describe("Maximum number of results to return"),
        },
        async (args) => {
          try {
            // Build video query conditions
            const videoConditions = [eq(videos.projectId, projectId), eq(videos.analysisStatus, "done")];
            if (args.videoIds?.length) {
              videoConditions.push(inArray(videos.id, args.videoIds));
            }

            // Fetch videos with clips
            const videoList = await db.query.videos.findMany({
              where: and(...videoConditions),
              with: { clips: true },
            });

            if (videoList.length === 0) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      reasoning: "No analyzed videos found in this project",
                      matchedClips: [],
                    }),
                  },
                ],
              };
            }

            // Collect and filter clips
            const allClips: ClipWithVideo[] = [];

            for (const video of videoList) {
              for (const clip of video.clips) {
                // Apply filters
                if (args.clipTypes?.length && !args.clipTypes.includes(clip.clipType)) {
                  continue;
                }
                if (args.maxDuration && clip.endTime - clip.startTime > args.maxDuration) {
                  continue;
                }
                allClips.push({
                  clipId: clip.id,
                  videoId: video.id,
                  videoFileName: video.originalFileName,
                  videoUrl: video.r2Url,
                  timeRange: clip.timeRange,
                  startTime: clip.startTime,
                  endTime: clip.endTime,
                  clipType: clip.clipType,
                  description: clip.description,
                  reason: clip.reason,
                });
              }
            }

            if (allClips.length === 0) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      reasoning: "No clips match the specified filters",
                      matchedClips: [],
                    }),
                  },
                ],
              };
            }

            // Use LLM for intelligent matching
            const searchResult = await searchClipsWithLLM(args.query, allClips, args.limit);

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(searchResult, null, 2),
                },
              ],
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
      ),

      // Tool 3: Get video details with all clips
      tool(
        "get_video_clips",
        "Get detailed information about a specific video and all its analyzed clips",
        {
          videoId: z.string().uuid().describe("The ID of the video to get details for"),
        },
        async (args) => {
          try {
            const video = await db.query.videos.findFirst({
              where: and(eq(videos.id, args.videoId), eq(videos.projectId, projectId)),
              with: { clips: true },
            });

            if (!video) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Video not found or not accessible",
                  },
                ],
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
                clipType: c.clipType,
                description: c.description,
                reason: c.reason,
              })),
            };

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
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
      ),

      // Tool 4: Trigger video re-analysis
      tool(
        "analyze_video",
        "Trigger (re)analysis of a video with an optional custom prompt. Use this when the user wants to find specific types of clips.",
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
                content: [
                  {
                    type: "text" as const,
                    text: "Video not found or not accessible",
                  },
                ],
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

            // Trigger analysis in background
            triggerVideoAnalysis(args.videoId, args.analysisRequest);

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    message: "Analysis started",
                    videoId: args.videoId,
                    analysisRequest: args.analysisRequest || "Using default analysis prompt",
                  }),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error triggering analysis: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}

// Export tool names for allowedTools configuration
export const VIDEO_TOOL_NAMES = [
  "mcp__video-tools__list_project_videos",
  "mcp__video-tools__search_video_clips",
  "mcp__video-tools__get_video_clips",
  "mcp__video-tools__analyze_video",
];
