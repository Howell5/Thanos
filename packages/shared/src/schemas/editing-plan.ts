import { z } from "zod";

/**
 * Editing segment - a single clip in the editing timeline
 */
export const editingSegmentSchema = z.object({
  /** Reference to videoClip ID */
  clipId: z.string().uuid(),
  /** Source video ID */
  videoId: z.string().uuid(),
  /** Video R2 URL */
  videoUrl: z.string().url(),
  /** Trim start time (seconds) relative to source video */
  startTime: z.number().nonnegative(),
  /** Trim end time (seconds) relative to source video */
  endTime: z.number().nonnegative(),
  /** Purpose of this segment in the final video */
  purpose: z.string(),
  /** Voiceover script for TTS (null = no voiceover for this segment) */
  voiceover: z.string().nullable(),
  /** Text overlay on screen */
  textOverlay: z.string().nullable(),
  /** Text overlay position */
  textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
  /** Transition effect to next segment */
  transition: z.enum(["cut", "fade", "dissolve"]).default("cut"),
});

export type EditingSegment = z.infer<typeof editingSegmentSchema>;

/**
 * Audio configuration for the entire video
 */
export const audioConfigSchema = z.object({
  /** BGM resource URL (R2 storage) */
  bgmUrl: z.string().url().nullable(),
  /** BGM volume 0-1 */
  bgmVolume: z.number().min(0).max(1).default(0.2),
  /** Mute all original audio from source clips */
  muteOriginalAudio: z.boolean().default(true),
  /** TTS voice ID (Volcengine TTS voice) */
  voiceId: z.string().nullable(),
  /** TTS speech speed multiplier */
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
});

export type AudioConfig = z.infer<typeof audioConfigSchema>;

/**
 * Editing plan status
 */
export const editingPlanStatusSchema = z.enum([
  "draft",
  "confirmed",
  "rendering",
  "done",
  "failed",
]);

export type EditingPlanStatus = z.infer<typeof editingPlanStatusSchema>;

/**
 * Full editing plan - the core data structure connecting Agent output to Remotion input
 */
export const editingPlanSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  /** Target duration in seconds */
  targetDuration: z.number().positive(),
  /** Target aspect ratio */
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  /** Output resolution */
  resolution: z.enum(["720p", "1080p"]).default("1080p"),
  /** Frames per second */
  fps: z.number().int().default(30),
  /** Ordered segment list (order = playback order) */
  segments: z.array(editingSegmentSchema).min(1),
  /** Audio configuration */
  audio: audioConfigSchema,
  /** Agent's reasoning for the editing choices */
  reasoning: z.string(),
  /** Render status */
  status: editingPlanStatusSchema,
  /** Rendered output video URL */
  outputUrl: z.string().url().nullable(),
  /** Render error message */
  renderError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EditingPlan = z.infer<typeof editingPlanSchema>;

/**
 * Schema for creating an editing plan (Agent MCP tool input)
 */
export const createEditingPlanSchema = z.object({
  title: z.string().min(1),
  targetDuration: z.number().positive(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  segments: z
    .array(
      z.object({
        clipId: z.string().uuid(),
        startTime: z.number().nonnegative(),
        endTime: z.number().nonnegative(),
        purpose: z.string(),
        voiceover: z.string().nullable().default(null),
        textOverlay: z.string().nullable().default(null),
        textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
        transition: z.enum(["cut", "fade", "dissolve"]).default("cut"),
      }),
    )
    .min(1),
  audio: z
    .object({
      muteOriginalAudio: z.boolean().default(true),
      bgmVolume: z.number().min(0).max(1).default(0.2),
      voiceId: z.string().nullable().default(null),
      voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
    })
    .default({}),
  reasoning: z.string(),
});

export type CreateEditingPlan = z.infer<typeof createEditingPlanSchema>;
