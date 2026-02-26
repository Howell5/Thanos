/**
 * Derives CanvasShapeSummary[] from the live tldraw editor.
 * Pure function — no React, no hooks.
 */

import type { Editor, TLShape } from "tldraw";
import type { CanvasShapeSummary } from "@/stores/use-canvas-shape-store";

/**
 * Generate a brief one-line description for a shape.
 * Mirrors the backend computeBrief logic in canvas-helpers.ts.
 */
function computeBrief(editor: Editor, shape: TLShape): string {
  const props = shape.props as unknown as Record<string, unknown>;
  switch (shape.type) {
    case "canvas-video":
      return `video: ${props.fileName ?? props.videoUrl ?? ""}`;
    case "image": {
      const assetId = props.assetId as string | undefined;
      const asset = assetId ? editor.getAsset(assetId as Parameters<typeof editor.getAsset>[0]) : undefined;
      const name = (asset?.props as Record<string, unknown>)?.name ?? "unknown";
      return `image: "${name}" (${props.w}x${props.h})`;
    }
    case "rich-card":
      return `card: ${props.title ?? props.template ?? ""}`;
    case "text": {
      const richText = props.richText as
        | { content?: Array<{ content?: Array<{ text?: string }> }> }
        | undefined;
      const plainText =
        richText?.content
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

/**
 * Extract thumbnail URL for a shape (synchronous).
 * Returns CDN URL or data URI for images, null for other types.
 */
function extractThumbnail(editor: Editor, shape: TLShape): string | null {
  if (shape.type === "image") {
    const assetId = (shape.props as unknown as Record<string, unknown>).assetId as string | undefined;
    if (!assetId) return null;
    const asset = editor.getAsset(assetId as Parameters<typeof editor.getAsset>[0]);
    return ((asset?.props as Record<string, unknown>)?.src as string) ?? null;
  }
  if (shape.type === "canvas-video") {
    // Video thumbnails would require async frame extraction — skip for now
    return null;
  }
  return null;
}

/**
 * Derive shape summaries from the live tldraw editor.
 * Called on every tldraw store change to keep the shape store in sync.
 */
export function deriveShapeSummaries(editor: Editor): CanvasShapeSummary[] {
  const shapes = editor.getCurrentPageShapes();
  return shapes.map((shape) => {
    const props = shape.props as unknown as Record<string, unknown>;
    return {
      id: shape.id,
      type: shape.type,
      brief: computeBrief(editor, shape),
      thumbnailUrl: extractThumbnail(editor, shape),
      x: shape.x,
      y: shape.y,
      w: typeof props.w === "number" ? props.w : null,
      h: typeof props.h === "number" ? props.h : null,
    };
  });
}
