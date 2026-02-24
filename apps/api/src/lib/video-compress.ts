/**
 * Video compression utility for AI analysis.
 * Transcodes video to low fps, max 720p height, mp4 output.
 * Uses fluent-ffmpeg — falls back to original buffer if unavailable.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_HEIGHT = 720;
const DEFAULT_FPS = 1;

export async function compressVideoForAnalysis(
  inputBuffer: Buffer<ArrayBufferLike>,
  mimeType: string,
  fps: number = DEFAULT_FPS,
): Promise<Buffer<ArrayBufferLike>> {
  // biome-ignore lint: dynamic import for optional dependency
  let ffmpeg: any = null;
  try {
    const mod = await import("fluent-ffmpeg");
    ffmpeg = mod.default ?? mod;
  } catch {
    console.warn("[VideoCompress] fluent-ffmpeg not available, skipping compression");
    return inputBuffer;
  }

  const ext = mimeType === "video/webm" ? "webm" : "mp4";
  const tmpDir = mkdtempSync(join(tmpdir(), "video-compress-"));
  const inputPath = join(tmpDir, `input.${ext}`);
  const outputPath = join(tmpDir, "output.mp4");

  writeFileSync(inputPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg!(inputPath)
        .videoFilters([
          `fps=${fps}`,
          `scale='if(gt(ih\\,${MAX_HEIGHT})\\,trunc(iw*${MAX_HEIGHT}/ih/2)*2\\,iw)':'if(gt(ih\\,${MAX_HEIGHT})\\,${MAX_HEIGHT}\\,ih)'`,
        ])
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions(["-preset", "fast", "-crf", "28", "-movflags", "+faststart"])
        .output(outputPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const compressed = readFileSync(outputPath);
    const origMB = (inputBuffer.byteLength / 1024 / 1024).toFixed(1);
    const compMB = (compressed.byteLength / 1024 / 1024).toFixed(1);
    console.log(`[VideoCompress] ${origMB}MB -> ${compMB}MB`);
    return compressed;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
