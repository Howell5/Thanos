/**
 * Gemini 2.5 Flash Describe Service
 * Uses @google/genai SDK (Vertex AI) for generating concise descriptions of images and videos.
 */

import { GoogleGenAI } from "@google/genai";
import { validateEnv } from "../env";
import { isGeminiConfigured } from "../lib/gemini-ai";

export { isGeminiConfigured };

export const GEMINI_DESCRIBE_MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const env = validateEnv();
  return new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_VERTEX_PROJECT!,
    location: env.GOOGLE_VERTEX_LOCATION,
  });
}

const IMAGE_SYSTEM_PROMPT = `你是一个视觉描述助手。请用 1-3 句话简洁客观地描述图片内容。关注主体、构图、色彩和重要细节。`;

const VIDEO_SYSTEM_PROMPT = `你是一个视频描述助手。请用 2-4 句话简洁客观地描述视频内容。概述主要主体、关键动作或事件、场景和整体氛围。`;

export async function describeWithGemini(params: {
  mediaType: "image" | "video";
  base64Data: string;
  mimeType: string;
  fileName?: string;
}): Promise<string> {
  const { mediaType, base64Data, mimeType, fileName } = params;
  const ai = getClient();

  const systemPrompt = mediaType === "image" ? IMAGE_SYSTEM_PROMPT : VIDEO_SYSTEM_PROMPT;
  const fileNote = fileName ? ` 文件名: "${fileName}".` : "";
  const userText = `请描述这个${mediaType === "image" ? "图片" : "视频"}。${fileNote}`;

  const response = await ai.models.generateContent({
    model: GEMINI_DESCRIBE_MODEL,
    contents: [
      { inlineData: { mimeType, data: base64Data } },
      { text: userText },
    ],
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 512,
    },
  });

  const text = response.candidates?.[0]?.content?.parts
    ?.filter((p) => p.text)
    .map((p) => p.text)
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned empty response");
  return text;
}
