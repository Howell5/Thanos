/**
 * Canvas generate_image tool (batch-capable)
 *
 * Generates images using Gemini or Seedream v5 (fal.ai),
 * uploads to R2, records in DB, deducts credits, and emits
 * add_shape events to place images on the canvas.
 */

import { randomUUID } from "node:crypto";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import { aiImages, aiUsageHistory, projects, shapeMetadata, user } from "../../../db/schema";
import { deleteFromR2, generateImageKey, uploadToR2 } from "../../../lib/r2";
import { loadProjectStore } from "./canvas-helpers";
import type { ShapeRefMap } from "./canvas-refs";
import type { CanvasToolsEmitter } from "./canvas-write-tools";
import {
  GEMINI_PRO_MODEL,
  estimateCreditsForModel,
  generateWithProvider,
  getProviderName,
  isModelAvailable,
  isSeedreamModel,
} from "./image-provider";

const VALID_ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

const taskSchema = z.object({
  prompt: z.string().min(1).describe("Text description of the image to generate"),
  negativePrompt: z.string().optional().describe("Things to avoid"),
  aspectRatio: z.enum(VALID_ASPECT_RATIOS).default("1:1").describe("Aspect ratio"),
  imageSize: z.enum(["1K", "2K", "4K"]).default("1K").describe("Resolution (Pro model only)"),
  model: z
    .string()
    .optional()
    .describe(
      "Model ID. Options: gemini-2.5-flash-image (default, 50cr), gemini-3-pro-image-preview (100cr), seedream-v5 (40cr, fal.ai).",
    ),
  numberOfImages: z.number().min(1).max(4).default(1).describe("Images per task (1-4)"),
  referenceShapeIds: z
    .array(z.string())
    .optional()
    .describe(
      "Shape IDs of canvas images to use as visual context. The model sees these images and follows the prompt to produce new output.",
    ),
  x: z.number().optional().describe("Canvas X coordinate for the first generated image. Must be provided together with y. Additional images in the batch auto-place in a row beside it."),
  y: z.number().optional().describe("Canvas Y coordinate for the first generated image. Must be provided together with x."),
  summary: z.string().max(200).optional().describe("Short human-readable context summary"),
});

export function createGenerateImageTool(
  projectId: string,
  userId: string,
  emitter: CanvasToolsEmitter,
  refs: ShapeRefMap,
) {
  return tool(
    "generate_image",
    `Generate images using AI and place them on the canvas. Batch-capable: 1-8 independent tasks.

- Provide only a prompt for text-to-image generation.
- Provide referenceShapeIds to give the model visual context — it sees the referenced canvas images alongside your prompt. Works for style transfer, editing, combining elements, background removal, etc.
- Use x/y per task to place generated images at specific canvas coordinates. If omitted, images are auto-placed to avoid overlap. Prefer explicit x/y when you know where the image should appear relative to existing content.

Models: gemini-2.5-flash-image (50cr), gemini-3-pro-image-preview (100cr, default), seedream-v5 (40cr, fal.ai).
Each task can produce 1-4 images. All tasks run in parallel.`,
    {
      tasks: z.array(taskSchema).min(1).max(8).describe("Array of generation tasks"),
    },
    async (args) => {
      try {
        // Verify project ownership
        const project = await db.query.projects.findFirst({
          where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
          columns: { id: true },
        });
        if (!project) {
          return {
            content: [{ type: "text" as const, text: "Project not found or access denied" }],
            isError: true,
          };
        }

        // Expand tasks and compute total credits, resolve short refs
        const expanded = args.tasks.map((t) => {
          const model = t.model || GEMINI_PRO_MODEL;
          const cost = estimateCreditsForModel(model, t.imageSize) * t.numberOfImages;
          return {
            ...t,
            model,
            referenceShapeIds: t.referenceShapeIds?.map((id) => refs.resolve(id)),
            costPerImage: estimateCreditsForModel(model, t.imageSize),
            totalCost: cost,
          };
        });
        const totalCredits = expanded.reduce((sum, t) => sum + t.totalCost, 0);

        // Check model availability
        for (const t of expanded) {
          if (!isModelAvailable(t.model)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Model ${t.model} is not configured. Check API keys.`,
                },
              ],
              isError: true,
            };
          }
        }

        // Generate a group ID for batch placement
        const groupId =
          expanded.length > 1 || expanded.some((t) => t.numberOfImages > 1)
            ? randomUUID().slice(0, 8)
            : undefined;

        // Run all tasks in parallel
        const taskResults = await Promise.allSettled(
          expanded.map((t) => runSingleGenTask(projectId, userId, t, emitter, groupId)),
        );

        // Collect results
        let successCount = 0;
        let actualCredits = 0;
        const outputs: string[] = [];

        for (let i = 0; i < taskResults.length; i++) {
          const r = taskResults[i];
          if (r.status === "fulfilled") {
            successCount += r.value.imageCount;
            actualCredits += r.value.creditsUsed;
            outputs.push(`Task ${i + 1}: ${r.value.imageCount} image(s) generated`);
          } else {
            outputs.push(`Task ${i + 1}: FAILED — ${r.reason?.message || r.reason}`);
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: successCount > 0,
                totalImages: successCount,
                totalCreditsUsed: actualCredits,
                tasks: outputs,
              }),
            },
          ],
          ...(successCount === 0 ? { isError: true } : {}),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Generation failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

interface TaskInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  imageSize: string;
  model: string;
  numberOfImages: number;
  referenceShapeIds?: string[];
  x?: number;
  y?: number;
  summary?: string;
  costPerImage: number;
  totalCost: number;
}

interface TaskOutput {
  imageCount: number;
  creditsUsed: number;
}

async function runSingleGenTask(
  projectId: string,
  userId: string,
  task: TaskInput,
  emitter: CanvasToolsEmitter,
  groupId?: string,
): Promise<TaskOutput> {
  // Fetch reference images if needed (both base64 for Gemini and URLs for Seedream)
  let refs: ResolvedRefs | undefined;
  if (task.referenceShapeIds?.length) {
    refs = await resolveShapeImages(projectId, userId, task.referenceShapeIds);
  }

  // Generate images — provider handles reference routing internally
  const baseReq = {
    prompt: task.prompt,
    negativePrompt: task.negativePrompt,
    model: task.model,
    aspectRatio: task.aspectRatio,
    referenceImages: refs?.base64Images,
    referenceImageUrls: refs?.urls.length ? refs.urls : undefined,
  };

  type ImageResult = Array<{
    imageData: Buffer;
    width: number;
    height: number;
    mimeType: string;
    durationMs: number;
  }>;
  let results: ImageResult;

  if (isSeedreamModel(task.model) && !refs?.urls.length) {
    // Seedream t2i: supports batch natively
    results = await generateWithProvider({
      ...baseReq,
      numberOfImages: task.numberOfImages,
    });
  } else if (isSeedreamModel(task.model) && refs?.urls.length) {
    // Seedream with reference: edit endpoint, one image per call
    const promises = Array.from({ length: task.numberOfImages }, () =>
      generateWithProvider({ ...baseReq, numberOfImages: 1 }),
    );
    const settled = await Promise.allSettled(promises);
    results = settled
      .filter((r): r is PromiseFulfilledResult<ImageResult> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  } else {
    // Gemini: parallel single-image calls
    const promises = Array.from({ length: task.numberOfImages }, () =>
      generateWithProvider({
        ...baseReq,
        imageSize: task.imageSize as "1K" | "2K" | "4K",
        numberOfImages: 1,
      }),
    );
    const settled = await Promise.allSettled(promises);
    results = settled
      .filter((r): r is PromiseFulfilledResult<ImageResult> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  if (results.length === 0) throw new Error("No images generated");

  // Upload all to R2
  const uploads = await Promise.all(
    results.map(async (img) => {
      const key = generateImageKey(userId, projectId);
      const upload = await uploadToR2({
        key,
        data: img.imageData,
        contentType: img.mimeType,
        metadata: { userId, projectId },
      });
      return { key, upload, img };
    }),
  );

  // Atomic DB transaction: deduct credits + insert records
  const creditsNeeded = task.costPerImage * results.length;
  const contextLabel = task.summary || "AI-generated image";
  const hasRefs = !!refs?.base64Images?.length || !!refs?.urls.length;
  const refCount = Math.max(refs?.base64Images?.length ?? 0, refs?.urls.length ?? 0);
  const provider = getProviderName(task.model);
  const operation = hasRefs ? "image-to-image" : "text-to-image";
  // When references used, anchor results near the first reference shape
  const anchorShapeId = hasRefs ? task.referenceShapeIds?.[0] : undefined;

  try {
    await db.transaction(async (tx) => {
      let imageIndex = 0;
      for (const { key, upload, img } of uploads) {
        const tldrawId = randomUUID().replace(/-/g, "").slice(0, 12);
        const fullShapeId = `shape:${tldrawId}`;
        const description =
          refCount > 0
            ? `${contextLabel} (${task.model}, ${refCount} ref)`
            : `${contextLabel} (${task.model})`;

        const [record] = await tx
          .insert(aiImages)
          .values({
            projectId,
            userId,
            prompt: task.prompt,
            negativePrompt: task.negativePrompt,
            model: task.model,
            aspectRatio: task.aspectRatio,
            imageSize: task.imageSize,
            r2Key: key,
            r2Url: upload.url,
            width: img.width,
            height: img.height,
            fileSize: upload.size,
            mimeType: img.mimeType,
            creditsUsed: task.costPerImage,
            status: "completed",
          })
          .returning();

        await tx.insert(aiUsageHistory).values({
          userId,
          projectId,
          imageId: record.id,
          operation,
          model: task.model,
          provider,
          creditsCharged: task.costPerImage,
          durationMs: img.durationMs,
          success: true,
        });

        await tx.insert(shapeMetadata).values({
          projectId,
          userId,
          shapeId: fullShapeId,
          mediaType: "image",
          originalFileName: `generated-${tldrawId}.png`,
          description,
          status: "done",
          model: task.model,
          completedAt: new Date(),
        });

        const hint =
          groupId || anchorShapeId
            ? {
                ...(groupId ? { group: groupId } : {}),
                ...(anchorShapeId ? { referenceShapeId: anchorShapeId } : {}),
              }
            : undefined;
        emitter.emit("add_shape", {
          shapeType: "image" as const,
          url: upload.url,
          width: img.width,
          height: img.height,
          altText: task.prompt,
          description,
          shapeId: tldrawId,
          placementHint: hint,
          ...(imageIndex === 0 && task.x != null ? { x: task.x } : {}),
          ...(imageIndex === 0 && task.y != null ? { y: task.y } : {}),
        });
        imageIndex++;
      }
    });
  } catch (txError) {
    // Clean up orphaned R2 objects
    await Promise.all(uploads.map(({ key }) => deleteFromR2(key).catch(() => {})));
    throw txError;
  }

  return { imageCount: results.length, creditsUsed: creditsNeeded };
}

/** Resolved reference images — base64 for Gemini, URLs for Seedream */
interface ResolvedRefs {
  base64Images: string[];
  /** URLs of reference images (for Seedream edit endpoint, up to 10) */
  urls: string[];
}

/** Resolve canvas shapes to both base64 data and URLs */
async function resolveShapeImages(
  projectId: string,
  userId: string,
  shapeIds: string[],
): Promise<ResolvedRefs> {
  try {
    const { shapes, assets } = await loadProjectStore(projectId, userId);
    const urls: string[] = [];
    for (const shapeId of shapeIds) {
      const shape = shapes.find((s) => s.id === shapeId || s.id === `shape:${shapeId}`);
      if (!shape || shape.type !== "image") continue;
      const assetId = (shape.props as { assetId?: string })?.assetId;
      if (!assetId) continue;
      const asset = assets.get(assetId) ?? assets.get(`asset:${assetId}`);
      if (asset?.props.src) urls.push(asset.props.src);
    }
    const fetched = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          return Buffer.from(await res.arrayBuffer()).toString("base64");
        } catch {
          return null;
        }
      }),
    );
    return {
      base64Images: fetched.filter((r): r is string => r !== null),
      urls,
    };
  } catch {
    return { base64Images: [], urls: [] };
  }
}
