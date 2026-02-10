/**
 * Video Render Service Implementation
 * Orchestrates TTS synthesis, Remotion bundling/rendering, and R2 upload.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { EditingPlan, EditingSegment } from "@repo/shared";
import { planToProps } from "@repo/video/plan-to-props";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { editingPlans } from "../db/schema";
import { uploadToR2 } from "../lib/r2";
import { createTTSService } from "./tts.service";
import type { IVideoRenderService } from "./types";

/** In-memory render progress tracking */
const renderProgress = new Map<string, { progress: number; status: string }>();

/** Lazy-cached Remotion bundle URL */
let cachedBundleUrl: string | null = null;

/**
 * Get or create the Remotion webpack bundle.
 * The bundle is cached as a lazy singleton since it's expensive to create.
 */
async function getBundleUrl(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;

  const entryPoint = resolve(import.meta.dirname, "../../../video/src/root.tsx");
  cachedBundleUrl = await bundle({ entryPoint });
  return cachedBundleUrl;
}

/**
 * Synthesize voiceovers for all segments that have voiceover text.
 * TTS failures are non-fatal - returns null for failed segments.
 */
async function synthesizeVoiceovers(
  segments: EditingSegment[],
  voiceId: string | null,
  voiceSpeed: number,
): Promise<(string | null)[]> {
  const ttsService = createTTSService();

  if (!ttsService.isConfigured()) {
    return segments.map(() => null);
  }

  return Promise.all(
    segments.map(async (seg) => {
      if (!seg.voiceover) return null;
      try {
        return await ttsService.synthesize(
          seg.voiceover,
          voiceId ?? undefined,
          voiceSpeed ?? undefined,
        );
      } catch (err) {
        console.error("TTS synthesis failed for segment, skipping:", err);
        return null;
      }
    }),
  );
}

/**
 * Reconstruct an EditingPlan-shaped object from a DB record for planToProps.
 */
function dbRecordToEditingPlan(plan: {
  id: string;
  projectId: string;
  title: string;
  targetDuration: number;
  aspectRatio: string;
  resolution: string;
  fps: number;
  segments: unknown;
  audioConfig: unknown;
  reasoning: string | null;
  status: string;
  outputUrl: string | null;
  renderError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EditingPlan {
  const audio = plan.audioConfig as EditingPlan["audio"];
  return {
    id: plan.id,
    projectId: plan.projectId,
    title: plan.title,
    targetDuration: plan.targetDuration,
    aspectRatio: plan.aspectRatio as EditingPlan["aspectRatio"],
    resolution: plan.resolution as EditingPlan["resolution"],
    fps: plan.fps,
    segments: plan.segments as EditingSegment[],
    audio,
    reasoning: plan.reasoning || "",
    status: plan.status as EditingPlan["status"],
    outputUrl: plan.outputUrl ?? null,
    renderError: plan.renderError ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * Production Video Render Service
 */
export class VideoRenderService implements IVideoRenderService {
  async startRender(planId: string): Promise<{ renderId: string }> {
    const renderId = crypto.randomUUID();
    renderProgress.set(renderId, { progress: 0, status: "starting" });

    // Run render in background (fire-and-forget with error handling)
    this.renderInBackground(planId, renderId).catch((error) => {
      console.error(`Render ${renderId} failed:`, error);
      renderProgress.set(renderId, {
        progress: 0,
        status: `failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    });

    return { renderId };
  }

  async getRenderProgress(renderId: string): Promise<{ progress: number; status: string }> {
    const progress = renderProgress.get(renderId);
    if (!progress) {
      return { progress: 0, status: "not_found" };
    }
    return progress;
  }

  async renderAndWait(planId: string): Promise<{
    status: "done" | "failed";
    outputUrl?: string;
    error?: string;
  }> {
    const renderId = crypto.randomUUID();
    renderProgress.set(renderId, { progress: 0, status: "starting" });

    try {
      await this.renderInBackground(planId, renderId);
      const plan = await db.query.editingPlans.findFirst({
        where: eq(editingPlans.id, planId),
        columns: { outputUrl: true, status: true },
      });
      return { status: "done", outputUrl: plan?.outputUrl ?? undefined };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  isConfigured(): boolean {
    // Render service is available if the video package is present
    return true;
  }

  /**
   * Background render pipeline:
   * 1. Read plan from DB
   * 2. TTS synthesis for voiceover segments (parallel)
   * 3. Convert plan to Remotion props via planToProps
   * 4. Bundle Remotion project (cached)
   * 5. Render video with renderMedia
   * 6. Upload output MP4 to R2
   * 7. Update DB record with output URL
   */
  private async renderInBackground(planId: string, renderId: string): Promise<void> {
    // 1. Read plan from DB
    const plan = await db.query.editingPlans.findFirst({
      where: eq(editingPlans.id, planId),
    });
    if (!plan) throw new Error("Editing plan not found");

    // Update status to rendering
    await db
      .update(editingPlans)
      .set({ status: "rendering", updatedAt: new Date() })
      .where(eq(editingPlans.id, planId));

    renderProgress.set(renderId, { progress: 0.05, status: "synthesizing_tts" });

    // 2. TTS synthesis
    const segments = plan.segments as EditingSegment[];
    const audioConfig = plan.audioConfig as EditingPlan["audio"];

    const voiceoverUrls = await synthesizeVoiceovers(
      segments,
      audioConfig.voiceId,
      audioConfig.voiceSpeed,
    );

    renderProgress.set(renderId, { progress: 0.2, status: "bundling" });

    // 3. Convert plan to Remotion props
    const editingPlan = dbRecordToEditingPlan(plan);
    const props = planToProps(editingPlan, voiceoverUrls);
    const totalDurationInFrames = props.segments.reduce(
      (sum, seg) => sum + seg.durationInFrames,
      0,
    );

    // 4. Bundle Remotion project (cached after first call)
    const serveUrl = await getBundleUrl();

    renderProgress.set(renderId, { progress: 0.3, status: "rendering" });

    // 5. Select composition and render
    // Use local chrome-headless-shell to avoid downloading at runtime.
    // Set REMOTION_CHROME_EXECUTABLE env var to override.
    const browserExecutable = process.env.REMOTION_CHROME_EXECUTABLE || null;

    const composition = await selectComposition({
      serveUrl,
      id: "MarketingVideo",
      inputProps: props,
      browserExecutable,
    });

    // Override duration/dimensions from our props
    composition.durationInFrames = totalDurationInFrames;
    composition.fps = props.fps;
    composition.width = props.width;
    composition.height = props.height;

    // Create temp directory for output
    const tempDir = await mkdtemp(join(tmpdir(), "remotion-render-"));
    const outputPath = join(tempDir, "output.mp4");

    try {
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: outputPath,
        inputProps: props,
        browserExecutable,
        onProgress: ({ progress }) => {
          // Map render progress to 0.3-0.9 range
          const mappedProgress = 0.3 + progress * 0.6;
          renderProgress.set(renderId, { progress: mappedProgress, status: "rendering" });
        },
      });

      renderProgress.set(renderId, { progress: 0.9, status: "uploading" });

      // 6. Upload to R2
      const videoBuffer = readFileSync(outputPath);

      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const r2Key = `projects/${plan.projectId}/renders/${timestamp}-${random}.mp4`;

      const uploadResult = await uploadToR2({
        key: r2Key,
        data: videoBuffer,
        contentType: "video/mp4",
      });

      // 7. Update DB with success
      await db
        .update(editingPlans)
        .set({
          status: "done",
          outputR2Key: r2Key,
          outputUrl: uploadResult.url,
          updatedAt: new Date(),
        })
        .where(eq(editingPlans.id, planId));

      renderProgress.set(renderId, { progress: 1, status: "done" });
    } catch (error) {
      // Update DB with error
      await db
        .update(editingPlans)
        .set({
          status: "failed",
          renderError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(editingPlans.id, planId));
      throw error;
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Create the default video render service instance
 */
export function createVideoRenderService(): IVideoRenderService {
  return new VideoRenderService();
}
