/**
 * Volcengine TTS Service Implementation
 * Uses Volcengine's OpenAPI for text-to-speech synthesis,
 * uploads audio to R2, and returns CDN URLs.
 */

import { uploadToR2 } from "../lib/r2";
import type { ITTSService } from "./types";

const TTS_API_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";
const TTS_CLUSTER = "volcano_tts";
const TTS_SUCCESS_CODE = 3000;
const DEFAULT_VOICE_ID = "zh_female_tianmeixiaoyuan_moon_bigtts";
const DEFAULT_SPEED_RATIO = 1.0;

/**
 * Lazy getters for Volcengine TTS configuration
 * Reads environment variables at call time, not at module load time
 */
function getTTSConfig() {
  return {
    appId: process.env.VOLCENGINE_TTS_APP_ID || "",
    accessToken: process.env.VOLCENGINE_TTS_ACCESS_TOKEN || "",
  };
}

/**
 * Check if Volcengine TTS is configured
 */
export function isTTSConfigured(): boolean {
  const config = getTTSConfig();
  return !!(config.appId && config.accessToken);
}

/**
 * Volcengine TTS API response shape
 */
interface VolcengineTTSResponse {
  code: number;
  message: string;
  data?: string;
}

/**
 * Call Volcengine TTS API to synthesize text into audio
 * Returns base64-encoded mp3 audio data
 */
async function callTTSApi(text: string, voiceId: string, speedRatio: number): Promise<string> {
  const config = getTTSConfig();

  if (!config.appId || !config.accessToken) {
    throw new Error(
      "Volcengine TTS is not configured. Please set VOLCENGINE_TTS_APP_ID and VOLCENGINE_TTS_ACCESS_TOKEN.",
    );
  }

  const reqid = crypto.randomUUID();

  const body = {
    app: {
      appid: config.appId,
      token: config.accessToken,
      cluster: TTS_CLUSTER,
    },
    user: {
      uid: "default",
    },
    audio: {
      voice_type: voiceId,
      encoding: "mp3",
      speed_ratio: speedRatio,
    },
    request: {
      reqid,
      text,
      operation: "query",
    },
  };

  const response = await fetch(TTS_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer;${config.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Volcengine TTS API HTTP error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as VolcengineTTSResponse;

  if (result.code !== TTS_SUCCESS_CODE) {
    throw new Error(`Volcengine TTS API error (code ${result.code}): ${result.message}`);
  }

  if (!result.data) {
    throw new Error("Volcengine TTS API returned empty audio data");
  }

  return result.data;
}

/**
 * Generate a unique R2 key for a TTS audio file
 */
function generateTTSKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `tts/${timestamp}-${random}.mp3`;
}

/**
 * Production Volcengine TTS service
 */
export class TTSService implements ITTSService {
  async synthesize(
    text: string,
    voiceId: string = DEFAULT_VOICE_ID,
    speed: number = DEFAULT_SPEED_RATIO,
  ): Promise<string> {
    const base64Audio = await callTTSApi(text, voiceId, speed);

    // Decode base64 audio to buffer
    const audioBuffer = Buffer.from(base64Audio, "base64");

    // Upload to R2
    const key = generateTTSKey();
    const uploadResult = await uploadToR2({
      key,
      data: audioBuffer,
      contentType: "audio/mpeg",
    });

    return uploadResult.url;
  }

  async batchSynthesize(
    segments: { text: string; voiceId: string; speed?: number }[],
  ): Promise<string[]> {
    return Promise.all(
      segments.map((segment) =>
        this.synthesize(segment.text, segment.voiceId, segment.speed),
      ),
    );
  }

  isConfigured(): boolean {
    return isTTSConfigured();
  }
}

/**
 * Create the default TTS service instance
 */
export function createTTSService(): ITTSService {
  return new TTSService();
}
