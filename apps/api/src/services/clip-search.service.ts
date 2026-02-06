/**
 * Clip Search Service
 * Intelligent clip search using Gemini LLM
 */

import { GoogleGenAI } from "@google/genai";
import type { MatchedClip, SearchClipsResponse } from "@repo/shared";
import { validateEnv } from "../env";

// Search prompt template
const CLIP_SEARCH_PROMPT = `
你是一个视频片段检索助手。根据用户需求，从已索引的片段中找出最匹配的片段。

## 用户需求
{user_query}

## 可用片段索引
{clips_json}

## 任务
1. 理解用户的真实需求和意图
2. 从片段索引中找出所有符合需求的片段
3. 按匹配程度排序，最匹配的排在前面
4. 为每个匹配的片段给出匹配度评分（1-10）和匹配理由

## 输出格式
请以 JSON 格式返回：

{
  "reasoning": "整体判断说明，解释你的匹配逻辑",
  "matched_clips": [
    {
      "clip_id": "片段ID",
      "match_score": 8,
      "match_reason": "为什么这个片段符合用户需求"
    }
  ]
}

## 注意事项
1. 只返回确实符合用户需求的片段，不要勉强匹配
2. 如果没有任何片段符合，返回空数组并说明原因
3. match_score 评分标准：
   - 9-10：完美匹配用户需求
   - 7-8：很好地符合需求
   - 5-6：部分符合需求
   - 1-4：勉强相关（一般不应返回）
4. 只返回 JSON，不要添加其他内容
`;

// Clip info for LLM context
interface ClipInfo {
  clip_id: string;
  video_id: string;
  video_file_name: string | null;
  time_range: string;
  duration_seconds: number;
  clip_type: string;
  description: string;
  reason: string;
}

// Internal clip with full data
export interface ClipWithVideo {
  clipId: string;
  videoId: string;
  videoFileName: string | null;
  videoUrl: string;
  timeRange: string;
  startTime: number;
  endTime: number;
  clipType: string;
  description: string;
  reason: string;
}

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
 * Search clips using LLM intelligent matching
 */
export async function searchClipsWithLLM(
  query: string,
  clips: ClipWithVideo[],
  topK = 10,
): Promise<SearchClipsResponse> {
  if (clips.length === 0) {
    return {
      reasoning: "No clips available for search",
      matchedClips: [],
    };
  }

  if (!isGeminiConfigured()) {
    // Fallback to simple text matching if Gemini not configured
    return fallbackSearch(query, clips, topK);
  }

  // Prepare clip info for LLM (simplified format)
  const clipInfos: ClipInfo[] = clips.map((clip) => ({
    clip_id: clip.clipId,
    video_id: clip.videoId,
    video_file_name: clip.videoFileName,
    time_range: clip.timeRange,
    duration_seconds: clip.endTime - clip.startTime,
    clip_type: clip.clipType,
    description: clip.description,
    reason: clip.reason,
  }));

  // Build prompt
  const prompt = CLIP_SEARCH_PROMPT.replace("{user_query}", query).replace(
    "{clips_json}",
    JSON.stringify(clipInfos, null, 2),
  );

  try {
    const ai = getGeminiClient();

    console.log(`[ClipSearch] Searching ${clips.length} clips with query: "${query}"`);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    // Extract text from response
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No response from Gemini");
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error("No content in Gemini response");
    }

    let responseText = "";
    for (const part of candidate.content.parts) {
      if (part.text) {
        responseText = part.text;
        break;
      }
    }

    if (!responseText) {
      throw new Error("No text in Gemini response");
    }

    // Parse JSON response
    const parsed = parseSearchResponse(responseText);

    // Map matched clips to full data
    const clipMap = new Map(clips.map((c) => [c.clipId, c]));
    const matchedClips: MatchedClip[] = [];

    for (const match of parsed.matched_clips.slice(0, topK)) {
      const clipData = clipMap.get(match.clip_id);
      if (clipData) {
        matchedClips.push({
          clipId: clipData.clipId,
          videoId: clipData.videoId,
          videoFileName: clipData.videoFileName,
          videoUrl: clipData.videoUrl,
          timeRange: clipData.timeRange,
          startTime: clipData.startTime,
          endTime: clipData.endTime,
          clipType: clipData.clipType,
          description: clipData.description,
          matchScore: match.match_score,
          matchReason: match.match_reason,
        });
      }
    }

    console.log(`[ClipSearch] Found ${matchedClips.length} matching clips`);

    return {
      reasoning: parsed.reasoning,
      matchedClips,
    };
  } catch (error) {
    console.error("[ClipSearch] LLM search failed, falling back to simple search:", error);
    return fallbackSearch(query, clips, topK);
  }
}

/**
 * Parse LLM search response
 */
function parseSearchResponse(text: string): {
  reasoning: string;
  matched_clips: Array<{
    clip_id: string;
    match_score: number;
    match_reason: string;
  }>;
} {
  // Clean up potential markdown code blocks
  let jsonText = text.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  }
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }

  try {
    return JSON.parse(jsonText.trim());
  } catch (error) {
    console.error("[ClipSearch] Failed to parse LLM response:", jsonText.slice(0, 200));
    throw new Error("Failed to parse search response");
  }
}

/**
 * Fallback simple text-based search
 * Used when Gemini is not configured or fails
 */
function fallbackSearch(
  query: string,
  clips: ClipWithVideo[],
  topK: number,
): SearchClipsResponse {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter((k) => k.length > 1);

  // Score each clip by keyword matches
  const scored = clips.map((clip) => {
    const searchText = `${clip.clipType} ${clip.description} ${clip.reason}`.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        score += 2;
      }
    }

    // Boost for clip type match
    if (clip.clipType.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    return { clip, score };
  });

  // Sort by score and take top K
  const topClips = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const matchedClips: MatchedClip[] = topClips.map(({ clip, score }) => ({
    clipId: clip.clipId,
    videoId: clip.videoId,
    videoFileName: clip.videoFileName,
    videoUrl: clip.videoUrl,
    timeRange: clip.timeRange,
    startTime: clip.startTime,
    endTime: clip.endTime,
    clipType: clip.clipType,
    description: clip.description,
    matchScore: Math.min(10, Math.max(1, score)),
    matchReason: `Keyword match for: "${query}"`,
  }));

  return {
    reasoning: `Simple keyword search (LLM not available). Found ${matchedClips.length} clips matching "${query}".`,
    matchedClips,
  };
}
