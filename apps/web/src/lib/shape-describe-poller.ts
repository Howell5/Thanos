/**
 * Polls the shape-metadata endpoint after upload until description is ready.
 * Writes description back into tldraw shape.meta when done.
 * Also provides a store listener to auto-trigger describe when assets upload completes.
 */

import type { Editor, TLImageShape, TLShapeId } from "tldraw";
import type { ImageMeta } from "./image-assets";
import { api } from "./api";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 30; // 60 seconds max

export function pollShapeDescription(
  shapeId: string,
  projectId: string,
  editor: Editor,
): void {
  let attempts = 0;

  const poll = async () => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) return;

    try {
      const res = await api.api["shape-metadata"].$get({
        query: { shapeId, projectId },
      });
      const json = await res.json();
      if (!json.success) return;

      const data = json.data;

      if (data.status === "done" && data.description) {
        const shape = editor.getShape(shapeId as TLShapeId);
        if (!shape) return;

        editor.updateShape({
          id: shapeId as TLShapeId,
          type: shape.type,
          meta: {
            ...(shape.meta as Record<string, unknown>),
            description: data.description,
            ...(data.originalFileName ? { originalFileName: data.originalFileName } : {}),
          },
        });
        return;
      }

      if (data.status === "failed" || data.status === "skipped") {
        return;
      }

      // Still pending/processing — poll again
      setTimeout(poll, POLL_INTERVAL_MS);
    } catch {
      // Network error — retry
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  // Start after a short delay
  setTimeout(poll, 1500);
}

/**
 * On canvas load, batch-sync descriptions from the DB into shape.meta
 * for any image/video shapes that are missing a description.
 */
export async function syncDescriptionsFromDb(editor: Editor, projectId: string): Promise<void> {
  const allShapes = editor.getCurrentPageShapes();
  const missingIds: string[] = [];

  for (const shape of allShapes) {
    if (shape.type !== "image" && shape.type !== "canvas-video") continue;
    const meta = shape.meta as ImageMeta | undefined;
    if (meta?.description) continue;
    if (meta?.source === "generating" || meta?.source === "uploading") continue;
    missingIds.push(shape.id);
  }

  if (missingIds.length === 0) return;

  try {
    const res = await api.api["shape-metadata"].batch.$post({
      json: { projectId, shapeIds: missingIds },
    });
    const json = await res.json();
    if (!json.success) return;

    for (const row of json.data.metadata) {
      if (row.status !== "done" || !row.description) continue;
      const shape = editor.getShape(row.shapeId as TLShapeId);
      if (!shape) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic shape type
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        meta: {
          ...(shape.meta as Record<string, unknown>),
          description: row.description,
          ...(row.originalFileName ? { originalFileName: row.originalFileName } : {}),
        },
      } as any);
    }
  } catch (err) {
    console.warn("[ShapeDescribe] Failed to sync descriptions from DB:", err);
  }
}

// Track shapes that already had describe triggered to avoid duplicates
const triggeredShapes = new Set<string>();

function triggerDescribeForShape(
  shapeId: string,
  projectId: string,
  assetUrl: string,
  mimeType: string,
  fileName: string | undefined,
  editor: Editor,
) {
  const key = `${shapeId}:${projectId}`;
  if (triggeredShapes.has(key)) return;
  triggeredShapes.add(key);

  api.api["shape-metadata"].trigger.$post({
    json: {
      shapeId,
      projectId,
      assetUrl,
      mediaType: "image",
      mimeType,
      originalFileName: fileName,
    },
  }).then(() => {
    pollShapeDescription(shapeId, projectId, editor);
  }).catch((err) => {
    console.warn("[ShapeDescribe] Failed to trigger:", err);
    triggeredShapes.delete(key);
  });
}

/**
 * Listen for store changes where an image asset's src changes from data: to a real URL.
 * When detected, find image shapes using that asset and trigger describe.
 */
export function listenForAssetUploads(editor: Editor, projectId: string): () => void {
  return editor.store.listen((entry) => {
    for (const [, to] of Object.values(entry.changes.updated)) {
      // Check for asset updates where src changed to a real URL
      if (to.typeName !== "asset" || to.type !== "image") continue;
      const asset = to as { id: string; props: { src?: string; mimeType?: string; name?: string } };
      const src = asset.props.src;
      if (!src || src.startsWith("data:")) continue;

      // Find image shapes using this asset
      const allShapes = editor.getCurrentPageShapes();
      for (const shape of allShapes) {
        if (shape.type !== "image") continue;
        const imageShape = shape as TLImageShape;
        if (imageShape.props.assetId !== asset.id) continue;

        const meta = shape.meta as ImageMeta | undefined;
        if (meta?.source === "generating" || meta?.source === "uploading") continue;
        if (meta?.description) continue;

        triggerDescribeForShape(
          shape.id,
          projectId,
          src,
          asset.props.mimeType ?? "image/png",
          asset.props.name ?? undefined,
          editor,
        );
      }
    }
  }, { source: "all", scope: "all" });
}
