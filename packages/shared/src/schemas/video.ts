import { z } from "zod";

/**
 * Video analysis status
 */
export const videoAnalysisStatusSchema = z.enum([
  "pending",
  "analyzing",
  "done",
  "failed",
]);

export type VideoAnalysisStatus = z.infer<typeof videoAnalysisStatusSchema>;

/**
 * Video clip data (from Gemini analysis)
 */
export const videoClipSchema = z.object({
  id: z.string().uuid(),
  videoId: z.string().uuid(),
  timeRange: z.string(), // "00:05-00:08"
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  clipType: z.string(),
  description: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});

export type VideoClip = z.infer<typeof videoClipSchema>;

/**
 * Video response type (for frontend display)
 */
export const videoResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  r2Url: z.string().url(),
  originalFileName: z.string().nullable(),
  fileSize: z.number().int(),
  mimeType: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration: z.number().int().nullable(),
  analysisStatus: videoAnalysisStatusSchema,
  analysisError: z.string().nullable(),
  clips: z.array(videoClipSchema),
  createdAt: z.string(),
});

export type VideoResponse = z.infer<typeof videoResponseSchema>;

/**
 * Schema for creating a video record after upload
 */
export const createVideoSchema = z.object({
  projectId: z.string().uuid(),
  r2Key: z.string().min(1),
  r2Url: z.string().url(),
  originalFileName: z.string().optional(),
  fileSize: z.number().int().positive(),
  mimeType: z.enum(["video/mp4", "video/webm"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
});

export type CreateVideo = z.infer<typeof createVideoSchema>;

/**
 * Schema for getting project videos
 */
export const getProjectVideosSchema = z.object({
  projectId: z.string().uuid(),
  includeClips: z.coerce.boolean().default(true),
  analysisStatus: videoAnalysisStatusSchema.optional(),
});

export type GetProjectVideos = z.infer<typeof getProjectVideosSchema>;

/**
 * Schema for manual video analysis trigger
 */
export const analyzeVideoSchema = z.object({
  videoId: z.string().uuid(),
  analysisRequest: z.string().min(1).max(2000).optional(),
});

export type AnalyzeVideo = z.infer<typeof analyzeVideoSchema>;

/**
 * Schema for clip search (Agent Tool)
 */
export const searchClipsSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().min(1).max(1000),
  // Optional filters
  videoIds: z.array(z.string().uuid()).optional(),
  clipTypes: z.array(z.string()).optional(),
  maxDuration: z.number().int().positive().optional(),
});

export type SearchClips = z.infer<typeof searchClipsSchema>;

/**
 * Matched clip result (from LLM search)
 */
export const matchedClipSchema = z.object({
  clipId: z.string().uuid(),
  videoId: z.string().uuid(),
  videoFileName: z.string().nullable(),
  videoUrl: z.string().url(),
  timeRange: z.string(),
  startTime: z.number().int(),
  endTime: z.number().int(),
  clipType: z.string(),
  description: z.string(),
  matchScore: z.number().min(1).max(10),
  matchReason: z.string(),
});

export type MatchedClip = z.infer<typeof matchedClipSchema>;

/**
 * Search clips response
 */
export const searchClipsResponseSchema = z.object({
  reasoning: z.string(),
  matchedClips: z.array(matchedClipSchema),
});

export type SearchClipsResponse = z.infer<typeof searchClipsResponseSchema>;

/**
 * Default analysis prompt for video indexing
 */
export const DEFAULT_VIDEO_ANALYSIS_PROMPT = `
请详细分析这个视频，识别所有有剪辑价值的片段。按以下维度标记：

1. **hook** - 适合作为短视频开场的片段（视觉冲击、悬念、吸引注意力）
2. **产品展示** - 产品全貌或特写镜头
3. **品牌露出** - Logo、品牌名称清晰可见的片段
4. **拆箱/开箱** - 拆封、打开包装的动作
5. **使用演示** - 产品使用过程展示
6. **情绪高点** - 惊喜、满意、兴奋等情绪表达
7. **转场素材** - 适合用作转场的镜头
8. **其他亮点** - 任何有剪辑价值的片段

请尽可能详细地描述每个片段的内容和特征。
`.trim();
