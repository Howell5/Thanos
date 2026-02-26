/**
 * Shape Describe Service
 * Orchestrates AI-powered description generation for canvas media shapes.
 * Follows the fire-and-forget pattern from video-analysis.service.ts.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { shapeMetadata } from "../db/schema";
import { compressVideoForAnalysis } from "../lib/video-compress";
import { GEMINI_DESCRIBE_MODEL, describeWithGemini, isGeminiConfigured } from "./gemini-describe.service";
import { KIMI_MODEL, describeWithKimi, isKimiConfigured } from "./kimi-describe.service";

export interface DescribeShapeParams {
  shapeId: string;
  projectId: string;
  userId: string;
  assetUrl: string;
  mediaType: "image" | "video";
  mimeType: string;
  originalFileName?: string;
}

/**
 * Fire-and-forget entry point.
 */
export function triggerShapeDescribe(params: DescribeShapeParams): void {
  describeShapeBackground(params).catch((err) => {
    console.error(`[ShapeDescribe] Background failed for ${params.shapeId}:`, err);
  });
}

async function describeShapeBackground(params: DescribeShapeParams): Promise<void> {
  const { shapeId, projectId, userId, assetUrl, mediaType, mimeType, originalFileName } = params;
  console.log(`[ShapeDescribe] Starting for shape ${shapeId} (${mediaType})`);

  // Determine which provider to use: prefer Gemini, fallback to Kimi
  const useGemini = isGeminiConfigured();
  const useKimi = !useGemini && isKimiConfigured();
  const modelName = useGemini ? GEMINI_DESCRIBE_MODEL : KIMI_MODEL;

  // Upsert pending row
  await db
    .insert(shapeMetadata)
    .values({
      projectId,
      userId,
      shapeId,
      mediaType,
      originalFileName: originalFileName ?? null,
      status: "processing",
      model: modelName,
    })
    .onConflictDoUpdate({
      target: [shapeMetadata.shapeId, shapeMetadata.projectId],
      set: { status: "processing", model: modelName, updatedAt: new Date() },
    });

  try {
    if (!useGemini && !useKimi) {
      await updateStatus(shapeId, projectId, "skipped", "No AI provider configured (need GOOGLE_VERTEX_PROJECT or KIMI_API_KEY)");
      return;
    }

    // Download asset
    console.log(`[ShapeDescribe] Downloading ${assetUrl} (provider: ${useGemini ? "gemini" : "kimi"})`);
    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`Failed to download asset: ${response.status}`);
    }
    let buffer: Buffer<ArrayBufferLike> = Buffer.from(new Uint8Array(await response.arrayBuffer()));

    // For video: compress before sending to AI
    let finalMimeType = mimeType;
    if (mediaType === "video") {
      buffer = await compressVideoForAnalysis(buffer, mimeType);
      finalMimeType = "video/mp4";
    }

    const base64Data = buffer.toString("base64");
    const description = useGemini
      ? await describeWithGemini({ mediaType, base64Data, mimeType: finalMimeType, fileName: originalFileName })
      : await describeWithKimi({ mediaType, base64Data, mimeType: finalMimeType, fileName: originalFileName });

    await db
      .update(shapeMetadata)
      .set({
        description,
        status: "done",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(shapeMetadata.shapeId, shapeId), eq(shapeMetadata.projectId, projectId)));

    console.log(`[ShapeDescribe] Done: "${description.slice(0, 80)}..."`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ShapeDescribe] Failed for ${shapeId}:`, msg);
    await updateStatus(shapeId, projectId, "failed", msg);
  }
}

async function updateStatus(shapeId: string, projectId: string, status: string, error?: string) {
  await db
    .update(shapeMetadata)
    .set({ status, error: error ?? null, updatedAt: new Date() })
    .where(and(eq(shapeMetadata.shapeId, shapeId), eq(shapeMetadata.projectId, projectId)));
}

/**
 * Lookup shape metadata by shapeId + projectId.
 */
export async function getShapeMetadataRecord(shapeId: string, projectId: string) {
  return db.query.shapeMetadata.findFirst({
    where: and(eq(shapeMetadata.shapeId, shapeId), eq(shapeMetadata.projectId, projectId)),
    columns: {
      status: true,
      description: true,
      originalFileName: true,
      model: true,
      mediaType: true,
    },
  });
}

/**
 * Load all done metadata for a project as a Map keyed by shapeId.
 */
export type ShapeMetadataMap = Map<
  string,
  { description: string | null; originalFileName: string | null }
>;

export async function loadProjectShapeMetadata(
  projectId: string,
): Promise<ShapeMetadataMap> {
  const rows = await db.query.shapeMetadata.findMany({
    where: and(eq(shapeMetadata.projectId, projectId), eq(shapeMetadata.status, "done")),
    columns: { shapeId: true, description: true, originalFileName: true },
  });
  return new Map(
    rows.map((r) => [
      r.shapeId,
      { description: r.description, originalFileName: r.originalFileName },
    ]),
  );
}

/**
 * Batch lookup for specific shape IDs.
 */
export async function batchGetShapeMetadata(projectId: string, shapeIds: string[]) {
  return db.query.shapeMetadata.findMany({
    where: and(
      eq(shapeMetadata.projectId, projectId),
      inArray(shapeMetadata.shapeId, shapeIds),
    ),
    columns: {
      shapeId: true,
      status: true,
      description: true,
      originalFileName: true,
      model: true,
    },
  });
}
