/**
 * Editing Plan MCP Tool
 * Creates video editing plans from selected clips
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { editingPlans, videoClips } from "../../db/schema";

/**
 * Create the editing plan tool scoped to a project
 */
export function createEditingPlanTool(projectId: string, userId: string) {
  return tool(
    "create_editing_plan",
    "Create a video editing plan with segment selection, voiceover scripts, and audio config. Call this after searching clips to assemble them into a final video.",
    {
      title: z.string().min(1).describe("Video title"),
      targetDuration: z.number().positive().describe("Target video duration in seconds"),
      aspectRatio: z
        .enum(["9:16", "16:9", "1:1"])
        .default("9:16")
        .describe("Video aspect ratio"),
      segments: z
        .array(
          z.object({
            clipId: z.string().uuid().describe("Video clip ID from search results"),
            startTime: z.number().nonnegative().describe("Trim start (seconds) in source video"),
            endTime: z.number().nonnegative().describe("Trim end (seconds) in source video"),
            purpose: z.string().describe("Purpose of this segment (e.g. 'opening hook')"),
            voiceover: z
              .string()
              .nullable()
              .default(null)
              .describe("Voiceover script for TTS"),
            textOverlay: z
              .string()
              .nullable()
              .default(null)
              .describe("Text to display on screen"),
            textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
            transition: z.enum(["cut", "fade", "dissolve"]).default("cut"),
          }),
        )
        .min(1)
        .describe("Ordered list of video segments"),
      audio: z
        .object({
          muteOriginalAudio: z.boolean().default(true),
          bgmVolume: z.number().min(0).max(1).default(0.2),
        })
        .default({})
        .describe("Audio configuration"),
      reasoning: z.string().describe("Explanation of editing choices for the user"),
    },
    async (args) => {
      try {
        // Validate all clipIds exist and belong to this project
        const clipIds = args.segments.map((s) => s.clipId);
        const clips = await db.query.videoClips.findMany({
          where: inArray(videoClips.id, clipIds),
          with: { video: true },
        });

        const clipMap = new Map(clips.map((c) => [c.id, c]));
        const missingClips = clipIds.filter((id) => !clipMap.has(id));
        if (missingClips.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Clips not found: ${missingClips.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        // Verify all clips belong to videos in this project
        for (const clip of clips) {
          if (clip.video.projectId !== projectId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Clip ${clip.id} belongs to a different project`,
                },
              ],
              isError: true,
            };
          }
        }

        // Build segments with videoId and videoUrl filled in
        const segments = args.segments.map((seg) => {
          const clip = clipMap.get(seg.clipId);
          return {
            ...seg,
            videoId: clip!.video.id,
            videoUrl: clip!.video.r2Url,
          };
        });

        // Insert into database
        const [plan] = await db
          .insert(editingPlans)
          .values({
            projectId,
            userId,
            title: args.title,
            targetDuration: args.targetDuration,
            aspectRatio: args.aspectRatio,
            segments: JSON.stringify(segments),
            audioConfig: JSON.stringify(args.audio),
            reasoning: args.reasoning,
            status: "draft",
          })
          .returning();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: "Editing plan created",
                  planId: plan.id,
                  title: plan.title,
                  segmentCount: segments.length,
                  status: "draft",
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
              text: `Error creating editing plan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
