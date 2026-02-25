/**
 * Maps CanvasShapeInstruction to tldraw editor.createShape() calls.
 * Pure function — no React, no hooks.
 */

import { RICH_CARD_SHAPE_TYPE } from "@/components/canvas/rich-card-shape";
import { VIDEO_SHAPE_TYPE } from "@/components/canvas/video-shape";
import type { CanvasShapeInstruction } from "@repo/shared";
import type { Editor, TLShapeId } from "tldraw";
import { AssetRecordType, createShapeId } from "tldraw";
import { findNonOverlappingPosition } from "./canvas-position";

// ─── Batch placement tracking ────────────────────────────────
// Tracks recently placed shapes per group for row-layout placement.
// Entries expire after 30 seconds to avoid stale anchors.

interface GroupEntry {
  shapeIds: TLShapeId[];
  timestamp: number;
}

const groupPlacedShapes = new Map<string, GroupEntry>();
const GROUP_TTL_MS = 30_000;

function cleanStaleGroups() {
  const now = Date.now();
  for (const [key, entry] of groupPlacedShapes) {
    if (now - entry.timestamp > GROUP_TTL_MS) {
      groupPlacedShapes.delete(key);
    }
  }
}

function getGroupSiblings(groupId: string): TLShapeId[] {
  const entry = groupPlacedShapes.get(groupId);
  if (!entry) return [];
  if (Date.now() - entry.timestamp > GROUP_TTL_MS) {
    groupPlacedShapes.delete(groupId);
    return [];
  }
  return entry.shapeIds;
}

function trackGroupShape(groupId: string, shapeId: TLShapeId) {
  const entry = groupPlacedShapes.get(groupId);
  if (entry) {
    entry.shapeIds.push(shapeId);
    entry.timestamp = Date.now();
  } else {
    groupPlacedShapes.set(groupId, { shapeIds: [shapeId], timestamp: Date.now() });
  }
}

/**
 * Create a tldraw shape on the canvas from an agent instruction.
 * Returns the created shape ID, or null if creation failed.
 */
export function handleAddShape(
  editor: Editor,
  instruction: CanvasShapeInstruction,
): TLShapeId | null {
  cleanStaleGroups();
  switch (instruction.shapeType) {
    case "text":
      return addTextShape(editor, instruction);
    case "image":
      return addImageShape(editor, instruction);
    case "video":
      return addVideoShape(editor, instruction);
    case "file":
      return addFileShape(editor, instruction);
    case "audio":
      return addAudioShape(editor, instruction);
    case "frame":
      return addFrameShape(editor, instruction);
    default:
      return null;
  }
}

function getAutoPosition(editor: Editor, w: number, h: number) {
  return findNonOverlappingPosition(editor, [], w, h);
}

/** Convert plain text to tldraw v4 richText (ProseMirror doc) format */
function toRichText(text: string) {
  const lines = text.split("\n");
  const content = lines.map((line) =>
    line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
  );
  return { type: "doc", content };
}

function addTextShape(
  editor: Editor,
  instruction: Extract<CanvasShapeInstruction, { shapeType: "text" }>,
): TLShapeId {
  const shapeId = createShapeId();
  const w = instruction.width ?? 300;
  const pos =
    instruction.x != null && instruction.y != null
      ? { x: instruction.x, y: instruction.y }
      : getAutoPosition(editor, w, 100);

  const size = instruction.fontSize && instruction.fontSize > 32 ? "xl" : "m";
  editor.createShape({
    id: shapeId,
    type: "text",
    x: pos.x,
    y: pos.y,
    props: {
      richText: toRichText(instruction.content),
      size,
      font: "sans",
      textAlign: "start",
      autoSize: true,
      w,
    },
  } as Parameters<typeof editor.createShape>[0]);
  return shapeId;
}

function addImageShape(
  editor: Editor,
  instruction: Extract<CanvasShapeInstruction, { shapeType: "image" }>,
): TLShapeId {
  const w = instruction.width ?? 320;
  const h = instruction.height ?? 320;
  const shapeId = instruction.shapeId ? createShapeId(instruction.shapeId) : createShapeId();
  const hint = instruction.placementHint;

  // Determine anchor shape IDs for placement
  let anchorIds: string[] = [];
  if (hint?.referenceShapeId) {
    // Edit mode: anchor near the reference image
    anchorIds = [hint.referenceShapeId];
    // Also include group siblings if any
    if (hint.group) {
      const siblings = getGroupSiblings(hint.group);
      anchorIds = [...anchorIds, ...siblings.map(String)];
    }
  } else if (hint?.group) {
    // Batch generation: anchor near previous group siblings for row layout
    anchorIds = getGroupSiblings(hint.group).map(String);
  }

  const pos =
    anchorIds.length > 0
      ? findNonOverlappingPosition(editor, anchorIds, w, h)
      : getAutoPosition(editor, w, h);

  // Track in group if applicable
  if (hint?.group) {
    trackGroupShape(hint.group, shapeId);
  }

  const assetId = AssetRecordType.createId();

  editor.createAssets([
    {
      id: assetId,
      type: "image",
      typeName: "asset",
      props: {
        name: instruction.altText ?? "agent-image",
        src: instruction.url,
        w,
        h,
        mimeType: "image/png",
        isAnimated: false,
      },
      meta: {},
    },
  ]);

  editor.createShape({
    id: shapeId,
    type: "image",
    x: pos.x,
    y: pos.y,
    props: { assetId, w, h },
    meta: instruction.description ? { description: instruction.description } : {},
  });
  return shapeId;
}

function addVideoShape(
  editor: Editor,
  instruction: Extract<CanvasShapeInstruction, { shapeType: "video" }>,
): TLShapeId {
  const w = instruction.width ?? 480;
  const h = instruction.height ?? 270;
  const pos = getAutoPosition(editor, w, h);
  const shapeId = createShapeId();

  editor.createShape({
    id: shapeId,
    type: VIDEO_SHAPE_TYPE,
    x: pos.x,
    y: pos.y,
    props: {
      w,
      h,
      videoUrl: instruction.url,
      fileName: instruction.fileName ?? "Video",
    },
  });
  return shapeId;
}

function addFileShape(
  editor: Editor,
  instruction: Extract<CanvasShapeInstruction, { shapeType: "file" }>,
): TLShapeId {
  const w = 400;
  const h = 200;
  const pos = getAutoPosition(editor, w, h);
  const shapeId = createShapeId();

  editor.createShape({
    id: shapeId,
    type: RICH_CARD_SHAPE_TYPE,
    x: pos.x,
    y: pos.y,
    props: {
      w,
      h,
      template: "file",
      cardData: JSON.stringify(instruction),
      title: instruction.fileName,
    },
  });
  return shapeId;
}

function addAudioShape(
  editor: Editor,
  instruction: Extract<CanvasShapeInstruction, { shapeType: "audio" }>,
): TLShapeId {
  const w = 400;
  const h = 200;
  const pos = getAutoPosition(editor, w, h);
  const shapeId = createShapeId();

  editor.createShape({
    id: shapeId,
    type: RICH_CARD_SHAPE_TYPE,
    x: pos.x,
    y: pos.y,
    props: {
      w,
      h,
      template: "audio",
      cardData: JSON.stringify(instruction),
      title: instruction.fileName ?? "Audio",
    },
  });
  return shapeId;
}

function addFrameShape(
  editor: Editor,
  instruction: Extract<CanvasShapeInstruction, { shapeType: "frame" }>,
): TLShapeId {
  const shapeId = createShapeId();
  editor.createShape({
    id: shapeId,
    type: "frame",
    x: instruction.x,
    y: instruction.y,
    props: {
      w: instruction.width,
      h: instruction.height,
      name: instruction.label,
    },
  });
  return shapeId;
}
