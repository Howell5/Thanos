/**
 * fal.ai Seedream v5 Image Generation
 * Uses @fal-ai/client to call ByteDance Seedream endpoints
 */

import { fal } from "@fal-ai/client";
import { validateEnv } from "../env";
import type { GenerateImageResult } from "./gemini-ai";

// Aspect ratio → width/height at 1K base
const ASPECT_RATIO_DIMS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "3:2": { w: 1024, h: 683 },
  "2:3": { w: 683, h: 1024 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
  "4:5": { w: 819, h: 1024 },
  "5:4": { w: 1024, h: 819 },
  "9:16": { w: 576, h: 1024 },
  "16:9": { w: 1024, h: 576 },
  "21:9": { w: 1024, h: 439 },
};

export interface FalGenerateParams {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  numberOfImages?: number;
}

export interface FalEditParams {
  prompt: string;
  imageUrls: string[];
  negativePrompt?: string;
}

/** Check if fal.ai is configured */
export function isFalConfigured(): boolean {
  const env = validateEnv();
  return !!env.FAL_KEY;
}

/** Configure the fal client with the API key */
function configureFal(): void {
  const env = validateEnv();
  if (!env.FAL_KEY) throw new Error("FAL_KEY is not configured");
  fal.config({ credentials: env.FAL_KEY });
}

/** Download an image URL to a Buffer */
async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download fal image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generate images using Seedream v5 via fal.ai
 */
export async function generateFalImage(params: FalGenerateParams): Promise<GenerateImageResult[]> {
  configureFal();
  const startTime = Date.now();
  const dims = ASPECT_RATIO_DIMS[params.aspectRatio || "1:1"] || ASPECT_RATIO_DIMS["1:1"];
  const count = params.numberOfImages || 1;

  console.log("[fal.ai] Starting Seedream generation", {
    prompt: params.prompt.slice(0, 80),
    aspectRatio: params.aspectRatio || "1:1",
    numberOfImages: count,
  });

  const result = await fal.subscribe("fal-ai/bytedance/seedream/v5/lite/text-to-image", {
    input: {
      prompt: params.prompt,
      ...(params.negativePrompt ? { negative_prompt: params.negativePrompt } : {}),
      image_size: { width: dims.w, height: dims.h },
      num_images: count,
    },
  });

  const images = result.data?.images as
    | Array<{ url: string; width?: number; height?: number }>
    | undefined;
  if (!images?.length) throw new Error("No images returned from Seedream");

  // Download all images in parallel
  const results: GenerateImageResult[] = await Promise.all(
    images.map(async (img) => {
      const imageData = await downloadImage(img.url);
      return {
        imageData,
        width: img.width ?? dims.w,
        height: img.height ?? dims.h,
        mimeType: "image/png",
        durationMs: Date.now() - startTime,
      };
    }),
  );

  console.log("[fal.ai] Seedream generation complete", {
    count: results.length,
    durationMs: Date.now() - startTime,
  });

  return results;
}

/**
 * Edit an image using Seedream v5 via fal.ai
 */
export async function editFalImage(params: FalEditParams): Promise<GenerateImageResult> {
  configureFal();
  const startTime = Date.now();

  console.log("[fal.ai] Starting Seedream edit", {
    prompt: params.prompt.slice(0, 80),
  });

  const result = await fal.subscribe("fal-ai/bytedance/seedream/v5/lite/edit", {
    input: {
      prompt: params.prompt,
      image_urls: params.imageUrls,
      ...(params.negativePrompt ? { negative_prompt: params.negativePrompt } : {}),
    },
  });

  const images = result.data?.images as
    | Array<{ url: string; width?: number; height?: number }>
    | undefined;
  if (!images?.length) throw new Error("No images returned from Seedream edit");

  const img = images[0];
  const imageData = await downloadImage(img.url);

  console.log("[fal.ai] Seedream edit complete", { durationMs: Date.now() - startTime });

  return {
    imageData,
    width: img.width ?? 1024,
    height: img.height ?? 1024,
    mimeType: "image/png",
    durationMs: Date.now() - startTime,
  };
}
