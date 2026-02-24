/**
 * Canvas write tools: add_shape
 * Uses an EventEmitter bridge to communicate shape creation events to the SSE stream.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "node:events";
import { z } from "zod";
import type { CanvasShapeInstruction } from "@repo/shared";

// ─── EventEmitter Bridge ─────────────────────────────────────

export interface CanvasToolsEmitter extends EventEmitter {
  emit(event: "add_shape", payload: CanvasShapeInstruction): boolean;
  on(event: "add_shape", listener: (payload: CanvasShapeInstruction) => void): this;
}

export function createCanvasToolsEmitter(): CanvasToolsEmitter {
  return new EventEmitter() as CanvasToolsEmitter;
}

// ─── add_shape Tool ──────────────────────────────────────────

export function createAddShapeTool(emitter: CanvasToolsEmitter) {
  return tool(
    "add_shape",
    `Add a new shape to the canvas. The shape will appear immediately on the user's canvas. Use this to present results, artifacts, and outputs visually.

IMPORTANT — readability & layout guidelines:
- For text: ALWAYS set width explicitly — this controls how wide the text block renders. Use width 300–600 for body text so it wraps naturally; use a narrower width (150–250) for short labels or titles so they don't stretch across the canvas. Use fontSize 32–48 for titles/headings, 20–24 for body text. Match the width to the expected text length: a short title like "Hello" needs width ~150, a paragraph needs width ~500.
- For images: set width/height proportionally so content is clearly visible (at least 300px on the short edge).
- Consider the existing canvas layout: use list_shapes first to see what's already there and choose coordinates that don't overlap with existing shapes. Leave ~30px padding between shapes.
- When placing multiple shapes (e.g. titles under images), align them deliberately — use consistent x values for columns and predictable y offsets so the result looks intentional, not scattered.`,
    {
      shapeType: z
        .enum(["text", "image", "video", "file", "audio"])
        .describe("Type of shape to add"),
      // Content fields — required depending on shapeType
      url: z
        .string()
        .url()
        .optional()
        .describe("Asset URL (required for image, video, file, audio)"),
      content: z
        .string()
        .optional()
        .describe("Text content (required for shapeType='text')"),
      fileName: z.string().optional().describe("Display file name"),
      width: z.number().positive().optional().describe("Width in px"),
      height: z.number().positive().optional().describe("Height in px"),
      fontSize: z.number().positive().optional().describe("Font size for text"),
      mimeType: z.string().optional().describe("MIME type for file"),
      duration: z.number().positive().optional().describe("Duration in seconds for audio"),
      altText: z.string().optional().describe("Alt text for image"),
      x: z.number().optional().describe("Canvas X coordinate (auto-positioned if omitted)"),
      y: z.number().optional().describe("Canvas Y coordinate (auto-positioned if omitted)"),
    },
    async (args) => {
      try {
        const instruction = buildInstruction(args);
        emitter.emit("add_shape", instruction);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                shapeType: args.shapeType,
                message: `${args.shapeType} shape added to canvas`,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Validate and build a typed CanvasShapeInstruction from flat tool args.
 * Throws if required fields are missing for the given shapeType.
 */
function buildInstruction(args: {
  shapeType: string;
  url?: string;
  content?: string;
  fileName?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  mimeType?: string;
  duration?: number;
  altText?: string;
  x?: number;
  y?: number;
}): CanvasShapeInstruction {
  switch (args.shapeType) {
    case "text": {
      if (!args.content) throw new Error("content is required for text shapes");
      return {
        shapeType: "text",
        content: args.content,
        x: args.x,
        y: args.y,
        fontSize: args.fontSize,
        width: args.width,
      };
    }
    case "image": {
      if (!args.url) throw new Error("url is required for image shapes");
      return {
        shapeType: "image",
        url: args.url,
        width: args.width,
        height: args.height,
        altText: args.altText,
      };
    }
    case "video": {
      if (!args.url) throw new Error("url is required for video shapes");
      return {
        shapeType: "video",
        url: args.url,
        fileName: args.fileName,
        width: args.width,
        height: args.height,
      };
    }
    case "file": {
      if (!args.url) throw new Error("url is required for file shapes");
      if (!args.fileName) throw new Error("fileName is required for file shapes");
      return {
        shapeType: "file",
        url: args.url,
        fileName: args.fileName,
        mimeType: args.mimeType,
      };
    }
    case "audio": {
      if (!args.url) throw new Error("url is required for audio shapes");
      return {
        shapeType: "audio",
        url: args.url,
        fileName: args.fileName,
        duration: args.duration,
      };
    }
    default:
      throw new Error(`Unsupported shape type: ${args.shapeType}`);
  }
}
