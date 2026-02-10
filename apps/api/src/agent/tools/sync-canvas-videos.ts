/**
 * Sync Canvas Video Shapes → videos DB
 *
 * When canvas data contains `canvas-video` shapes but no corresponding
 * DB records exist (e.g. after copy-pasting canvas data between projects),
 * this helper creates the missing DB records and triggers analysis.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { projects, videos } from "../../db/schema";
import { triggerVideoAnalysis } from "../../services/video-analysis.service";

interface CanvasVideoShape {
  type: "canvas-video";
  props: {
    videoUrl: string;
    fileName: string;
    w: number;
    h: number;
  };
  meta?: Record<string, unknown>;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
}

/**
 * Extract canvas-video shapes from tldraw canvas JSON
 */
function extractVideoShapes(canvasData: unknown): CanvasVideoShape[] {
  if (!canvasData || typeof canvasData !== "object") return [];

  const shapes: CanvasVideoShape[] = [];
  // tldraw canvas structure: { document: { store: { ... } } }
  const document = (canvasData as Record<string, unknown>).document;
  const store = (
    document && typeof document === "object"
      ? (document as Record<string, unknown>).store
      : undefined
  ) as Record<string, unknown> | undefined;
  if (!store || typeof store !== "object") return [];

  for (const value of Object.values(store as Record<string, unknown>)) {
    if (
      value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).type === "canvas-video" &&
      (value as Record<string, unknown>).props
    ) {
      shapes.push(value as CanvasVideoShape);
    }
  }

  return shapes;
}

/**
 * Extract R2 key from a CDN URL pathname.
 * e.g. "https://img.thanos.art/videos/abc/file.mp4" → "videos/abc/file.mp4"
 */
function extractR2Key(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    // Remove leading slash
    const key = url.pathname.replace(/^\//, "");
    return key || null;
  } catch {
    return null;
  }
}

/**
 * Fetch file size via HTTP HEAD request
 */
async function fetchFileSize(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return null;
    const contentLength = response.headers.get("content-length");
    return contentLength ? Number.parseInt(contentLength, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Sync canvas-video shapes from a project's canvasData into the videos DB table.
 * Creates missing records and triggers analysis for each new video.
 */
export async function syncCanvasVideosToDb(projectId: string, userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: 0 };

  // 1. Load project canvas data
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    columns: { canvasData: true },
  });

  if (!project?.canvasData) return result;

  // 2. Extract video shapes
  const shapes = extractVideoShapes(project.canvasData);
  if (shapes.length === 0) return result;

  // 3. Get existing r2Keys for this project to skip duplicates
  const existing = await db.query.videos.findMany({
    where: eq(videos.projectId, projectId),
    columns: { r2Key: true },
  });
  const existingKeys = new Set(existing.map((v) => v.r2Key));

  // 4. Process each shape
  for (const shape of shapes) {
    const { videoUrl, fileName, w, h } = shape.props;
    if (!videoUrl) {
      result.skipped++;
      continue;
    }

    const r2Key = extractR2Key(videoUrl);
    if (!r2Key) {
      result.skipped++;
      continue;
    }

    // Already exists in this project
    if (existingKeys.has(r2Key)) {
      result.skipped++;
      continue;
    }

    try {
      // Fetch file size via HEAD
      const fileSize = await fetchFileSize(videoUrl);
      if (fileSize == null) {
        result.errors++;
        continue;
      }

      // Read optional metadata from shape.meta
      const meta = shape.meta ?? {};
      const duration = typeof meta.duration === "number" ? Math.round(meta.duration) : undefined;

      // Insert into DB (onConflictDoNothing for safety)
      const [inserted] = await db
        .insert(videos)
        .values({
          projectId,
          userId,
          r2Key,
          r2Url: videoUrl,
          originalFileName: fileName || null,
          fileSize,
          mimeType: "video/mp4",
          width: w || null,
          height: h || null,
          duration: duration ?? null,
          analysisStatus: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: videos.id });

      if (inserted) {
        existingKeys.add(r2Key);
        result.synced++;
        // Trigger analysis in background
        triggerVideoAnalysis(inserted.id);
      } else {
        // Conflict — already existed (race condition)
        result.skipped++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}
