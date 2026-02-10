/**
 * Video Analysis Service
 * Handles async video analysis using Gemini AI
 */

import { GoogleGenAI } from "@google/genai";
import { DEFAULT_VIDEO_ANALYSIS_PROMPT } from "@repo/shared";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { videoClips, videos } from "../db/schema";
import { validateEnv } from "../env";
import { parseClipJson } from "../lib/clip-parser";

// Gemini video analysis prompt template (with user context injection)
const VIDEO_ANALYSIS_PROMPT_TEMPLATE = `
请逐段分析这个视频的完整内容。按时间顺序，将视频切分为有意义的片段，对每个片段进行客观描述。

## 用户补充说明
{user_request}

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
6. 参考用户补充说明来理解视频上下文，但描述仍需客观
7. 只返回 JSON，不要添加其他内容
`;

// Max video size for Gemini (20MB)
const MAX_VIDEO_SIZE_MB = 20;

/**
 * Get Gemini AI client configured for Vertex AI
 */
function getGeminiClient(): GoogleGenAI {
  const env = validateEnv();
  return new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_VERTEX_PROJECT!,
    location: env.GOOGLE_VERTEX_LOCATION,
  });
}

/**
 * Check if Gemini is configured
 */
function isGeminiConfigured(): boolean {
  const env = validateEnv();
  return !!env.GOOGLE_VERTEX_PROJECT;
}

/**
 * Trigger video analysis in background
 * This function returns immediately and runs analysis asynchronously
 */
export function triggerVideoAnalysis(videoId: string, analysisRequest?: string): void {
  // Run in background, don't await
  analyzeVideoBackground(videoId, analysisRequest).catch((err) => {
    console.error(`[VideoAnalysis] Background analysis failed for ${videoId}:`, err);
  });
}

/**
 * Run video analysis and wait for completion.
 * Returns the analysis result (clip count, status, error).
 */
export async function analyzeVideoAndWait(
  videoId: string,
  analysisRequest?: string,
): Promise<{ status: "done" | "failed"; clipCount: number; error?: string }> {
  try {
    await analyzeVideoBackground(videoId, analysisRequest);
    const video = await db.query.videos.findFirst({
      where: eq(videos.id, videoId),
      with: { clips: true },
    });
    return { status: "done", clipCount: video?.clips.length ?? 0 };
  } catch (error) {
    return {
      status: "failed",
      clipCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Background video analysis task
 * Updates status in DB as it progresses
 */
async function analyzeVideoBackground(videoId: string, analysisRequest?: string): Promise<void> {
  console.log(`[VideoAnalysis] Starting analysis for video ${videoId}`);

  // 1. Update status to analyzing
  await db
    .update(videos)
    .set({ analysisStatus: "analyzing", updatedAt: new Date() })
    .where(eq(videos.id, videoId));

  try {
    // 2. Get video info
    const video = await db.query.videos.findFirst({
      where: eq(videos.id, videoId),
    });

    if (!video) {
      throw new Error("Video not found");
    }

    // 3. Check if Gemini is configured
    if (!isGeminiConfigured()) {
      throw new Error("Gemini AI not configured");
    }

    // 4. Analyze video with Gemini
    const userRequest = analysisRequest || video.analysisRequest;
    const analysisResult = await analyzeVideoWithGemini(video.r2Url, userRequest || undefined);

    console.log(`[VideoAnalysis] Gemini analysis complete for ${videoId}, parsing clips...`);

    // 5. Parse JSON clip data
    const clips = parseClipJson(analysisResult, videoId);

    console.log(`[VideoAnalysis] Parsed ${clips.length} clips for ${videoId}`);

    // 6. Delete old clips and insert new ones
    await db.transaction(async (tx) => {
      await tx.delete(videoClips).where(eq(videoClips.videoId, videoId));

      if (clips.length > 0) {
        await tx.insert(videoClips).values(clips);
      }

      await tx
        .update(videos)
        .set({
          analysisStatus: "done",
          analysisRequest: userRequest || null,
          analyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId));
    });

    console.log(`[VideoAnalysis] Analysis complete for ${videoId}, ${clips.length} clips saved`);
  } catch (error) {
    // 7. Record failure
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[VideoAnalysis] Failed for ${videoId}:`, errorMessage);

    await db
      .update(videos)
      .set({
        analysisStatus: "failed",
        analysisError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId));
  }
}

/**
 * Analyze video using Gemini Flash
 * Downloads video, sends to Gemini, returns raw analysis text
 */
async function analyzeVideoWithGemini(videoUrl: string, userRequest?: string): Promise<string> {
  console.log(`[VideoAnalysis] Downloading video from ${videoUrl}`);

  // 1. Download video
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }

  const videoBuffer = await response.arrayBuffer();
  const sizeMB = videoBuffer.byteLength / 1024 / 1024;

  console.log(`[VideoAnalysis] Video downloaded, size: ${sizeMB.toFixed(2)}MB`);

  // 2. Check size limit
  if (sizeMB > MAX_VIDEO_SIZE_MB) {
    // TODO: Implement video compression
    throw new Error(
      `Video too large (${sizeMB.toFixed(2)}MB). Max ${MAX_VIDEO_SIZE_MB}MB supported.`,
    );
  }

  // 3. Build prompt
  let prompt: string;
  if (userRequest) {
    prompt = VIDEO_ANALYSIS_PROMPT_TEMPLATE.replace("{user_request}", userRequest);
  } else {
    prompt = DEFAULT_VIDEO_ANALYSIS_PROMPT;
  }

  // 4. Call Gemini
  const ai = getGeminiClient();

  console.log("[VideoAnalysis] Sending to Gemini for analysis...");

  const geminiResponse = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        inlineData: {
          mimeType: "video/mp4",
          data: Buffer.from(videoBuffer).toString("base64"),
        },
      },
      { text: prompt },
    ],
  });

  // 5. Extract text from response
  if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
    throw new Error("No response from Gemini");
  }

  const candidate = geminiResponse.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    throw new Error("No content in Gemini response");
  }

  // Find text part
  for (const part of candidate.content.parts) {
    if (part.text) {
      console.log(`[VideoAnalysis] Received analysis (${part.text.length} chars)`);
      return part.text;
    }
  }

  throw new Error("No text in Gemini response");
}
