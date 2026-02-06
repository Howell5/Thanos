import { z } from "zod";

/**
 * Video analysis status
 */
export const videoAnalysisStatusSchema = z.enum(["pending", "analyzing", "done", "failed"]);

export type VideoAnalysisStatus = z.infer<typeof videoAnalysisStatusSchema>;

/**
 * Video clip data (from Gemini analysis)
 * Objective description + structured metadata
 */
export const videoClipSchema = z.object({
  id: z.string().uuid(),
  videoId: z.string().uuid(),
  timeRange: z.string(), // "00:05-00:08"
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  // Objective description
  content: z.string(),
  // Structured metadata
  subjects: z.array(z.string()),
  actions: z.array(z.string()),
  scene: z.string().nullable(),
  shotType: z.string().nullable(),
  camera: z.string().nullable(),
  audio: z.string().nullable(),
  textOnScreen: z.string().nullable(),
  mood: z.string().nullable(),
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
  subjects: z.array(z.string()).optional(),
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
  content: z.string(),
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
 * Default analysis prompt for video indexing (objective, no value judgment)
 */
export const DEFAULT_VIDEO_ANALYSIS_PROMPT = `
请逐段分析这个视频的完整内容。按时间顺序，将视频切分为有意义的片段，对每个片段进行客观描述。

## 输出格式
以 JSON 格式输出，包含 clips 数组：

{
  "clips": [
    {
      "time": "MM:SS-MM:SS",
      "content": "客观描述画面中发生的事情：谁/什么在做什么，在什么场景",
      "subjects": ["画面中的主体，如：人物、产品、品牌名"],
      "actions": ["正在发生的动作"],
      "scene": "场景类型，如：室内/室外/工作室/街道",
      "shot_type": "景别：特写/中景/全景/大全景",
      "camera": "运镜：固定/推/拉/平移/跟随/手持",
      "audio": "音频特征：人声对白/旁白/音乐/环境音/静音",
      "text_on_screen": "画面中出现的文字、Logo、字幕（没有则为 null）",
      "mood": "基于表情、语调、画面色调判断的情绪氛围（没有明显情绪则为 null）"
    }
  ]
}

## 规则
1. 时间格式：MM:SS-MM:SS（如 00:05-00:12）
2. content 必须是客观描述，不要包含主观判断（如"精彩的"、"有价值的"）
3. 不要遗漏任何片段，完整覆盖视频时间线
4. subjects 和 actions 使用简短关键词
5. 如果某个字段无法判断，设为 null
6. 只返回 JSON，不要添加其他内容
`.trim();
