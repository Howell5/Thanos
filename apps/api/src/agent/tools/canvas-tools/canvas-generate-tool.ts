/**
 * Canvas generate_image tool
 *
 * Generates an image using Gemini Vertex AI (Nano Banana Pro),
 * uploads to R2, records in DB, deducts credits, and emits
 * an add_shape event to place the image on the canvas.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import {
  aiImages,
  aiUsageHistory,
  projects,
  shapeMetadata,
  user,
} from "../../../db/schema";
import {
  type GenerateImageParams,
  generateAIImage,
  isGeminiConfigured,
} from "../../../lib/gemini-ai";
import { deleteFromR2, generateImageKey, uploadToR2 } from "../../../lib/r2";
import type { CanvasToolsEmitter } from "./canvas-write-tools";
import { loadProjectStore } from "./canvas-helpers";

const DEFAULT_MODEL = "gemini-3-pro-image-preview";

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

export function createGenerateImageTool(
  projectId: string,
  userId: string,
  emitter: CanvasToolsEmitter,
) {
  return tool(
    "generate_image",
    `Generate an image using AI and add it to the canvas. Use this when the user explicitly asks to generate or create an image — not as a default way to "respond" or "present information".

The image is generated, uploaded to persistent storage, and placed on the canvas automatically.

Modes:
- **Text-to-image**: provide only a prompt.
- **Reference-based generation**: provide one or more referenceShapeIds from the canvas. The model sees all reference images and follows the prompt to produce a new image (e.g. style transfer, combining elements from multiple references).
- **Image editing**: provide the shape to edit as a referenceShapeId and describe the desired changes in the prompt (e.g. "remove the background", "change the sky to sunset").

Keep referenceShapeIds to 10 or fewer for best results.`,
    {
      prompt: z
        .string()
        .min(1)
        .describe(
          "Text description of the image to generate, or editing instructions when using references",
        ),
      negativePrompt: z
        .string()
        .optional()
        .describe("Things to avoid in the generated image"),
      aspectRatio: z
        .enum(VALID_ASPECT_RATIOS)
        .default("1:1")
        .describe("Aspect ratio of the generated image"),
      imageSize: z
        .enum(["1K", "2K", "4K"])
        .default("1K")
        .describe(
          "Output resolution (Pro model only; Flash always outputs 1K). 1K (1024px), 2K (2048px), 4K (4096px). 4K costs ~80% more for Pro model.",
        ),
      model: z
        .string()
        .optional()
        .describe(
          "Gemini model ID. Default: gemini-2.5-flash-image. Use gemini-3-pro-image-preview for higher quality (costs more).",
        ),
      referenceShapeIds: z
        .array(z.string())
        .optional()
        .describe(
          "Shape IDs of existing canvas images to use as references. For editing, pass the single image to edit. For style transfer or combining, pass multiple.",
        ),
      summary: z
        .string()
        .max(200)
        .optional()
        .describe(
          "A short human-readable summary describing why this image was generated and its context (e.g. 'product hero shot requested by user', 'edited version with background removed'). Do NOT repeat the prompt — describe the creation context instead.",
        ),
    },
    async (args) => {
      try {
        // Check configuration
        if (!isGeminiConfigured()) {
          return {
            content: [
              {
                type: "text" as const,
                text: "AI image generation is not configured. GOOGLE_VERTEX_PROJECT is missing.",
              },
            ],
            isError: true,
          };
        }

        // Verify project ownership
        const project = await db.query.projects.findFirst({
          where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
          columns: { id: true },
        });
        if (!project) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Project not found or access denied",
              },
            ],
            isError: true,
          };
        }

        // Pre-check credits (non-authoritative, just a fast-fail)
        const usedModel = args.model || DEFAULT_MODEL;
        const isProModel = usedModel.includes("pro");
        let creditsPerImage = isProModel ? 100 : 50;
        if (isProModel && args.imageSize === "4K") {
          creditsPerImage = Math.round(creditsPerImage * 1.8);
        }

        const userRecord = await db.query.user.findFirst({
          where: eq(user.id, userId),
          columns: { credits: true },
        });
        if (!userRecord || userRecord.credits < creditsPerImage) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Insufficient credits. Required: ${creditsPerImage}, available: ${userRecord?.credits ?? 0}. Ask the user to purchase more credits.`,
              },
            ],
            isError: true,
          };
        }

        // Build generation params
        const genParams: GenerateImageParams = {
          prompt: args.prompt,
          negativePrompt: args.negativePrompt,
          model: usedModel,
          aspectRatio: args.aspectRatio,
          imageSize: args.imageSize,
          numberOfImages: 1,
        };

        // Fetch reference images from canvas shapes
        if (args.referenceShapeIds?.length) {
          const refImages = await fetchShapeImages(
            projectId,
            userId,
            args.referenceShapeIds,
          );
          if (refImages.length > 0) {
            genParams.referenceImages = refImages;
          }
        }

        // Generate the image
        const result = await generateAIImage(genParams);

        // Upload to R2
        const imageKey = generateImageKey(userId, projectId);
        const upload = await uploadToR2({
          key: imageKey,
          data: result.imageData,
          contentType: result.mimeType,
          metadata: { userId, projectId },
        });

        // Pre-generate a tldraw-compatible shape ID so we can write shapeMetadata in the same tx
        const tldrawId = randomUUID().replace(/-/g, "").slice(0, 12);
        const fullShapeId = `shape:${tldrawId}`;

        // Build description from context summary (not the raw prompt)
        const refCount = genParams.referenceImages?.length ?? 0;
        const contextLabel = args.summary || "AI-generated image";
        const description =
          refCount > 0
            ? `${contextLabel} (${usedModel}, ${refCount} ref)`
            : `${contextLabel} (${usedModel})`;

        // Record in DB + atomically deduct credits + write shapeMetadata
        let imageRecord: typeof aiImages.$inferSelect;
        let creditsRemaining: number;
        try {
          const txResult = await db.transaction(async (tx) => {
            // Atomic conditional decrement — fails if credits insufficient
            const [updated] = await tx
              .update(user)
              .set({ credits: sql`${user.credits} - ${creditsPerImage}` })
              .where(
                and(eq(user.id, userId), gte(user.credits, creditsPerImage)),
              )
              .returning({ credits: user.credits });

            if (!updated) {
              throw new Error("INSUFFICIENT_CREDITS");
            }

            const [record] = await tx
              .insert(aiImages)
              .values({
                projectId,
                userId,
                prompt: args.prompt,
                negativePrompt: args.negativePrompt,
                model: usedModel,
                aspectRatio: args.aspectRatio || "1:1",
                imageSize: args.imageSize || "1K",
                r2Key: imageKey,
                r2Url: upload.url,
                width: result.width,
                height: result.height,
                fileSize: upload.size,
                mimeType: result.mimeType,
                creditsUsed: creditsPerImage,
                status: "completed",
              })
              .returning();

            await tx.insert(aiUsageHistory).values({
              userId,
              projectId,
              imageId: record.id,
              operation: genParams.referenceImages
                ? "image-to-image"
                : "text-to-image",
              model: usedModel,
              provider: "gemini",
              creditsCharged: creditsPerImage,
              durationMs: result.durationMs,
              success: true,
            });

            // Write shape description immediately — no async AI describe needed
            await tx.insert(shapeMetadata).values({
              projectId,
              userId,
              shapeId: fullShapeId,
              mediaType: "image",
              originalFileName: `generated-${tldrawId}.png`,
              description,
              status: "done",
              model: usedModel,
              completedAt: new Date(),
            });

            return { record, creditsRemaining: updated.credits };
          });

          imageRecord = txResult.record;
          creditsRemaining = txResult.creditsRemaining;
        } catch (txError) {
          // Clean up orphaned R2 object on DB failure
          await deleteFromR2(imageKey).catch(() => {});

          if (
            txError instanceof Error &&
            txError.message === "INSUFFICIENT_CREDITS"
          ) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Insufficient credits (race condition detected). Ask the user to purchase more credits.`,
                },
              ],
              isError: true,
            };
          }
          throw txError;
        }

        // Emit add_shape event — frontend uses the pre-assigned shapeId
        emitter.emit("add_shape", {
          shapeType: "image" as const,
          url: upload.url,
          width: result.width,
          height: result.height,
          altText: args.prompt,
          description,
          shapeId: tldrawId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                imageUrl: upload.url,
                imageId: imageRecord.id,
                width: result.width,
                height: result.height,
                model: usedModel,
                durationMs: result.durationMs,
                creditsUsed: creditsPerImage,
                creditsRemaining,
                addedToCanvas: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Image generation failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Fetch multiple images from canvas shapes as base64 strings.
 * Loads the project store once, then fetches all image URLs in parallel.
 */
async function fetchShapeImages(
  projectId: string,
  userId: string,
  shapeIds: string[],
): Promise<string[]> {
  try {
    const { shapes, assets } = await loadProjectStore(projectId, userId);

    // Resolve each shapeId to an image URL
    const urls: string[] = [];
    for (const shapeId of shapeIds) {
      const shape = shapes.find(
        (s) => s.id === shapeId || s.id === `shape:${shapeId}`,
      );
      if (!shape || shape.type !== "image") continue;

      const assetId = (shape.props as { assetId?: string })?.assetId;
      if (!assetId) continue;

      const asset = assets.get(assetId) ?? assets.get(`asset:${assetId}`);
      if (asset?.props.src) urls.push(asset.props.src);
    }

    // Fetch all in parallel
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const buf = Buffer.from(await res.arrayBuffer());
          return buf.toString("base64");
        } catch {
          return null;
        }
      }),
    );

    return results.filter((r): r is string => r !== null);
  } catch {
    return [];
  }
}
