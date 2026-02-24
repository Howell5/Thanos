/**
 * Canvas data parsing utilities.
 * Extracts shape information from tldraw's canvasData JSON stored in the DB.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { projects } from "../../../db/schema";

export interface TldrawShape {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  props: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface TldrawAsset {
  id: string;
  type: string;
  props: {
    src?: string;
    name?: string;
    w?: number;
    h?: number;
    mimeType?: string;
    fileSize?: number;
    [key: string]: unknown;
  };
}

export interface ShapeSummary {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  brief: string;
}

/** Parsed result from tldraw canvasData store */
export interface CanvasStoreData {
  shapes: TldrawShape[];
  assets: Map<string, TldrawAsset>;
}

/**
 * Parse the tldraw store from canvasData JSON.
 * Returns shapes and a map of assets keyed by asset ID.
 */
export function parseCanvasStore(canvasData: unknown): CanvasStoreData {
  const result: CanvasStoreData = { shapes: [], assets: new Map() };
  if (!canvasData || typeof canvasData !== "object") return result;

  const document = (canvasData as Record<string, unknown>).document;
  const store = (
    document && typeof document === "object"
      ? (document as Record<string, unknown>).store
      : undefined
  ) as Record<string, unknown> | undefined;
  if (!store || typeof store !== "object") return result;

  for (const value of Object.values(store)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const id = record.id as string | undefined;
    if (!id) continue;

    if (record.typeName === "shape" || id.startsWith("shape:")) {
      result.shapes.push(value as TldrawShape);
    } else if (record.typeName === "asset" || id.startsWith("asset:")) {
      result.assets.set(id, value as TldrawAsset);
    }
  }

  return result;
}

/** @deprecated Use parseCanvasStore instead */
export function parseCanvasShapes(canvasData: unknown): TldrawShape[] {
  return parseCanvasStore(canvasData).shapes;
}

/**
 * Generate a brief one-line description for a shape.
 */
function computeBrief(shape: TldrawShape, assets: Map<string, TldrawAsset>): string {
  const props = shape.props ?? {};
  switch (shape.type) {
    case "canvas-video":
      return `video: ${props.fileName ?? props.videoUrl ?? ""}`;
    case "image": {
      const asset = typeof props.assetId === "string" ? assets.get(props.assetId) : undefined;
      const name = asset?.props.name ?? "unknown";
      return `image: "${name}" (${props.w}×${props.h})`;
    }
    case "rich-card":
      return `card: ${props.title ?? props.template ?? ""}`;
    case "text": {
      const richText = props.richText as { content?: Array<{ content?: Array<{ text?: string }> }> } | undefined;
      const plainText = richText?.content
        ?.map((p) => p.content?.map((c) => c.text ?? "").join("") ?? "")
        .join("\n") ?? String(props.text ?? "");
      return `text: "${plainText.slice(0, 60)}"`;
    }
    case "geo":
      return `geo: ${props.geo ?? "rect"}`;
    case "arrow":
      return "arrow";
    case "draw":
      return "draw path";
    case "agent-turn":
      return `agent turn (${props.role ?? "assistant"})`;
    default:
      return shape.type;
  }
}

export function getShapeSummary(
  shape: TldrawShape,
  assets: Map<string, TldrawAsset> = new Map(),
): ShapeSummary {
  const props = shape.props ?? {};
  return {
    id: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    w: typeof props.w === "number" ? props.w : null,
    h: typeof props.h === "number" ? props.h : null,
    brief: computeBrief(shape, assets),
  };
}

/**
 * Resolve the asset src for an image shape.
 * Returns { src, mimeType } or null if not found / is base64.
 * For base64 assets, returns the raw data URI so the agent can see the image.
 */
export function resolveImageAsset(
  shape: TldrawShape,
  assets: Map<string, TldrawAsset>,
): { src: string; mimeType: string; name: string } | null {
  const assetId = shape.props?.assetId as string | undefined;
  if (!assetId) return null;
  const asset = assets.get(assetId);
  if (!asset?.props.src) return null;
  return {
    src: asset.props.src,
    mimeType: asset.props.mimeType ?? "image/png",
    name: asset.props.name ?? "image",
  };
}

/**
 * Load and parse canvas store data (shapes + assets) for a project from the DB.
 */
export async function loadProjectStore(
  projectId: string,
  userId: string,
): Promise<CanvasStoreData> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    columns: { canvasData: true },
  });
  if (!project?.canvasData) return { shapes: [], assets: new Map() };
  return parseCanvasStore(project.canvasData);
}

/** @deprecated Use loadProjectStore instead */
export async function loadProjectShapes(
  projectId: string,
  userId: string,
): Promise<TldrawShape[]> {
  const store = await loadProjectStore(projectId, userId);
  return store.shapes;
}
