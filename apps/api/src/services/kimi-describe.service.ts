/**
 * Kimi K2.5 Describe Service
 * OpenAI-compatible API for generating concise descriptions of images and videos.
 */

import OpenAI from "openai";
import { validateEnv } from "../env";

export const KIMI_MODEL = "kimi-k2.5";
const TIMEOUT_MS = 120_000;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    const env = validateEnv();
    if (!env.KIMI_API_KEY) {
      throw new Error("KIMI_API_KEY is not configured");
    }
    _client = new OpenAI({
      apiKey: env.KIMI_API_KEY,
      baseURL: "https://api.moonshot.cn/v1",
      timeout: TIMEOUT_MS,
    });
  }
  return _client;
}

export function isKimiConfigured(): boolean {
  return !!validateEnv().KIMI_API_KEY;
}

const IMAGE_SYSTEM_PROMPT = `你是一个视觉描述助手。请用 1-3 句话简洁客观地描述图片内容。关注主体、构图、色彩和重要细节。`;

const VIDEO_SYSTEM_PROMPT = `你是一个视频描述助手。请用 2-4 句话简洁客观地描述视频内容。概述主要主体、关键动作或事件、场景和整体氛围。`;

export async function describeWithKimi(params: {
  mediaType: "image" | "video";
  base64Data: string;
  mimeType: string;
  fileName?: string;
}): Promise<string> {
  const client = getClient();
  const { mediaType, base64Data, mimeType, fileName } = params;

  const systemPrompt = mediaType === "image" ? IMAGE_SYSTEM_PROMPT : VIDEO_SYSTEM_PROMPT;
  const fileNote = fileName ? ` 文件名: "${fileName}".` : "";

  // biome-ignore lint/suspicious/noExplicitAny: Kimi extends OpenAI API with video_url
  const contentParts: any[] = [];

  if (mediaType === "image") {
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64Data}` },
    });
  } else {
    // Kimi supports video_url (not in OpenAI SDK types)
    contentParts.push({
      type: "video_url",
      video_url: { url: `data:${mimeType};base64,${base64Data}` },
    });
  }

  contentParts.push({
    type: "text",
    text: `请描述这个${mediaType === "image" ? "图片" : "视频"}。${fileNote}`,
  });

  const response = await client.chat.completions.create({
    model: KIMI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: contentParts },
    ],
    max_tokens: 512,
    // Instant mode: disable thinking for faster response
    // biome-ignore lint/suspicious/noExplicitAny: Kimi-specific extra param
  } as any);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Kimi returned empty response");
  return content.trim();
}
