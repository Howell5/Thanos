/**
 * Maps CanvasShapeInstruction to tldraw editor.createShape() calls.
 * Pure function — no React, no hooks.
 */

import type { CanvasShapeInstruction } from "@repo/shared";
import type { Editor, TLShapeId } from "tldraw";
import { AssetRecordType, createShapeId } from "tldraw";
import { RICH_CARD_SHAPE_TYPE } from "@/components/canvas/rich-card-shape";
import { VIDEO_SHAPE_TYPE } from "@/components/canvas/video-shape";
import { findNonOverlappingPosition } from "./canvas-position";

/**
 * Create a tldraw shape on the canvas from an agent instruction.
 * Returns the created shape ID, or null if creation failed.
 */
export function handleAddShape(
  editor: Editor,
  instruction: CanvasShapeInstruction,
): TLShapeId | null {
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
  const pos = getAutoPosition(editor, w, h);
  const shapeId = createShapeId();
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
