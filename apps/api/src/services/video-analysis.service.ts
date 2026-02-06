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
import { parseClipTags } from "../lib/clip-parser";

// Gemini video analysis prompt template
const VIDEO_ANALYSIS_PROMPT_TEMPLATE = `
请详细分析这个视频的内容，识别并标记所有符合用户需求的片段。

## 用户需求
{user_request}

## 输出格式

对于每个符合条件的片段，使用以下 XML 格式输出：

<clip time="MM:SS-MM:SS" type="片段类型">
  <description>详细描述该片段的内容</description>
  <reason>解释为什么这个片段符合用户需求</reason>
</clip>

## 规则
1. time：时间格式为 MM:SS-MM:SS（如 00:05-00:08）
2. type：使用简短关键词（如：hook、品牌露出、产品展示）
3. 只标记明确符合需求的片段
4. description 和 reason 都要详细具体

现在请分析视频并输出符合条件的片段。
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
    const userRequest = analysisRequest || video.analysisRequest || DEFAULT_VIDEO_ANALYSIS_PROMPT;
    const analysisResult = await analyzeVideoWithGemini(video.r2Url, userRequest);

    console.log(`[VideoAnalysis] Gemini analysis complete for ${videoId}, parsing clips...`);

    // 5. Parse <clip> XML tags
    const clips = parseClipTags(analysisResult, videoId);

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
          analysisRequest: userRequest,
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
async function analyzeVideoWithGemini(videoUrl: string, userRequest: string): Promise<string> {
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
    throw new Error(`Video too large (${sizeMB.toFixed(2)}MB). Max ${MAX_VIDEO_SIZE_MB}MB supported.`);
  }

  // 3. Build prompt
  const prompt = VIDEO_ANALYSIS_PROMPT_TEMPLATE.replace("{user_request}", userRequest);

  // 4. Call Gemini
  const ai = getGeminiClient();

  console.log(`[VideoAnalysis] Sending to Gemini for analysis...`);

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
