import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { zValidator } from "@hono/zod-validator";
import type {
  CanvasShapeInstruction,
  MoveShapesPayload,
  ResizeShapesPayload,
  UpdateShapeMetaPayload,
} from "@repo/shared";
import { existsSync, mkdirSync } from "node:fs";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  CANVAS_TOOL_NAMES,
  createCanvasToolsEmitter,
  createCanvasToolsServer,
} from "../agent/tools/canvas-tools";
import { AgentLogger } from "../lib/agent-logger";
import { getSessionOrMock } from "../lib/mock-session";
import { errors } from "../lib/response";

// ─── System Prompt ───────────────────────────────────────────

function buildSystemPrompt(hasCanvasTools: boolean): string {
  const lines = [
    `You are an assistant inside Thanos, a canvas-based workspace for organizing and exploring multimodal information.`,
    `The user works on a visual canvas (powered by tldraw) where they arrange videos, images, text, and other media as reference materials.`,
    `Your job is to help them understand, organize, and navigate the information on their canvas — answering questions about content, rearranging layouts, adding notes or labels, and surfacing insights.`,
    ``,
    `## Important: Canvas Tools Are for Information Organization`,
    `The canvas tools (add_shape, move_shapes, resize_shapes, etc.) are for **organizing information on the canvas** — adding labels, annotations, notes, rearranging layout, grouping related items, etc.`,
    `They are NOT for creating or modifying multimodal content (e.g. don't try to "edit" an image by re-adding it, or "create a presentation" by assembling shapes).`,
    `Think of the canvas as a whiteboard or mood board: you help the user organize what's on it, not author new creative works through shape manipulation.`,
    ``,
    `## Communication`,
    `- Respond in the same language the user writes in.`,
    `- Be concise — the UI renders your text in a small chat panel.`,
    `- When the user asks a question about canvas content, prefer answering in chat text. Use add_shape only when placing information on the canvas genuinely helps (e.g. adding a label, annotation, or summary note next to related shapes).`,
  ];

  if (hasCanvasTools) {
    lines.push(
      ``,
      `## Available Canvas Tools`,
      ``,
      `### Read`,
      `- **list_shapes**: List all shapes on the canvas (images, videos, text, etc.) with position and dimensions. Use this to understand the current canvas layout.`,
      `- **get_shape**: Get full details of a shape by ID. For images, returns the actual image content so you can see and describe it.`,
      ``,
      `### Organize & Annotate`,
      `- **add_shape**: Add a text label, note, or reference link to the canvas. Can also place an image/video/file by URL. Use this for annotations, summaries, and organizational aids — not for "creating content".`,
      `- **move_shapes**: Rearrange shapes on the canvas. Use absolute (x, y) or relative (dx, dy) coordinates. Batch supported. Useful for grouping related items, aligning layouts, or decluttering.`,
      `- **resize_shapes**: Resize shapes. Use absolute (width, height) or a scale factor. Batch supported. Useful for making important items more prominent or fitting a layout.`,
      `- **update_shape_meta**: Update the meta field (free-form key-value) of shapes. Batch supported. Useful for tagging, categorizing, or adding structured data to shapes.`,
      ``,
      `### AI Generation`,
      `- **generate_image**: Generate an image using AI and add it to the canvas. Only use when the user explicitly asks to generate/create an image. Supports text-to-image, reference-based generation (pass referenceShapeIds), and image editing. Up to 10 references supported.`,
      ``,
      `### Video`,
      // `- **list_project_videos**: List all videos in the project with analysis status and clip counts.`,
      // `- **get_video_clips**: Get detailed clip breakdown for a specific video.`,
      // `- **search_video_clips**: Semantic search across all analyzed clips using natural language.`,
      `- **analyze_video**: Run AI analysis on a video to extract clip segments (blocks until done).`,
      // `- **create_editing_plan**: Assemble selected clips into an editing plan with voiceover, text overlays, transitions, and audio config.`,
      // `- **render_video**: Render a video from an editing plan (blocks until done, returns output URL).`,
    );
  }

  return lines.join("\n");
}

const mentionedShapeSchema = z.object({
  id: z.string(),
  type: z.string(),
  brief: z.string(),
  thumbnailUrl: z.string().nullable(),
});

// Request schema
const runAgentSchema = z.object({
  prompt: z.string().min(1),
  workspacePath: z.string().min(1),
  sessionId: z.string().optional(),
  projectId: z
    .string()
    .uuid()
    .optional()
    .describe("Project ID for canvas tools access"),
  mentionedShapes: z.array(mentionedShapeSchema).optional(),
});

/**
 * Fetch an image and return its base64 data + media type.
 * Returns null if the fetch fails so we can gracefully skip broken images.
 */
async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mediaType = res.headers.get("content-type") || "image/png";
    return { data: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

/**
 * Build a prompt with shape context. When image shapes have a thumbnailUrl,
 * fetches the images and returns multimodal content blocks with base64 data
 * so the model sees the image directly without an extra get_shape tool call.
 */
async function buildPromptWithShapeContext(
  prompt: string,
  shapes: z.infer<typeof mentionedShapeSchema>[],
): Promise<string | SDKUserMessage["message"]["content"]> {
  const contextLines: string[] = [];
  const imageShapes: { id: string; url: string }[] = [];

  for (const s of shapes) {
    contextLines.push(`- ${s.id} (${s.type}): ${s.brief}`);
    if (s.type === "image" && s.thumbnailUrl) {
      imageShapes.push({ id: s.id, url: s.thumbnailUrl });
    }
  }

  // No images with URLs — return plain text prompt
  if (imageShapes.length === 0) {
    return [
      "The user is referring to these canvas shapes:",
      contextLines.join("\n"),
      "",
      prompt,
    ].join("\n");
  }

  // Fetch all images in parallel
  const fetched = await Promise.all(
    imageShapes.map(async (img) => ({
      ...img,
      image: await fetchImageAsBase64(img.url),
    })),
  );

  // Build multimodal content blocks with inline base64 images
  const content: SDKUserMessage["message"]["content"] = [
    {
      type: "text" as const,
      text: [
        "The user is referring to these canvas shapes:",
        contextLines.join("\n"),
      ].join("\n"),
    },
  ];

  for (const img of fetched) {
    if (img.image) {
      content.push({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.image.mediaType,
          data: img.image.data,
        },
      } as never);
      content.push({
        type: "text" as const,
        text: `(Above image is shape ${img.id})`,
      });
    }
  }

  content.push({ type: "text" as const, text: prompt });
  return content;
}

/**
 * Message-based event model.
 *
 * - text_delta: streaming text fragment (append to current text message)
 * - text_done: the accumulated text block is finalized
 * - tool_use: a tool was invoked (complete: tool name + input)
 * - tool_result: result for a previous tool_use
 * - canvas_add_shape: agent requested adding a shape to the canvas
 * - system: session init
 * - result: agent finished (cost, tokens)
 * - error: something went wrong
 *
 * Keep in sync with apps/web/src/lib/agent-sse.ts
 */
type AgentMessage =
  | { type: "system"; sessionId: string }
  | { type: "text_delta"; content: string }
  | { type: "text_done" }
  | { type: "tool_use"; toolId: string; tool: string; input: unknown }
  | { type: "tool_result"; toolId: string; output: string }
  | { type: "canvas_add_shape"; instruction: CanvasShapeInstruction }
  | { type: "canvas_move_shapes"; payload: MoveShapesPayload }
  | { type: "canvas_resize_shapes"; payload: ResizeShapesPayload }
  | { type: "canvas_update_shape_meta"; payload: UpdateShapeMetaPayload }
  | { type: "result"; cost: number; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string };

const agentRoute = new Hono().post(
  "/run",
  zValidator("json", runAgentSchema),
  async (c) => {
    const session = await getSessionOrMock(c);
    if (!session) {
      return errors.unauthorized(c);
    }

    const {
      prompt: rawPrompt,
      workspacePath,
      sessionId,
      projectId,
      mentionedShapes,
    } = c.req.valid("json");
    const userId = session.user.id;

    // Build prompt — embed image thumbnails as multimodal content blocks when available
    const promptContent = mentionedShapes?.length
      ? await buildPromptWithShapeContext(rawPrompt, mentionedShapes)
      : rawPrompt;

    // If multimodal (array of content blocks), wrap in an async generator yielding SDKUserMessage
    const prompt: string | AsyncIterable<SDKUserMessage> =
      typeof promptContent === "string"
        ? promptContent
        : (async function* () {
            yield {
              type: "user" as const,
              message: { role: "user" as const, content: promptContent },
              parent_tool_use_id: null,
              session_id: "",
            };
          })();

    // Ensure workspace directory exists (guard against stale paths from client)
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true });
    }

    // Dev-only: create logger for this agent run
    const isDev = process.env.NODE_ENV !== "production";
    const logger = isDev ? new AgentLogger(sessionId) : null;
    if (logger) {
      logger.logRequest({
        prompt: rawPrompt,
        workspacePath,
        projectId,
        sessionId,
        mentionedShapes,
      });
      console.log(`[Agent] Log: ${logger.getFilePath()}`);
    }

    return streamSSE(c, async (stream) => {
      // Per-request state for message transformation
      const state = {
        hasOpenText: false,
        toolUseIdToName: new Map<string, string>(),
      };

      // EventEmitter bridge for canvas tools → SSE stream
      const pendingShapeEvents: CanvasShapeInstruction[] = [];
      const pendingMoveEvents: MoveShapesPayload[] = [];
      const pendingResizeEvents: ResizeShapesPayload[] = [];
      const pendingMetaEvents: UpdateShapeMetaPayload[] = [];
      const emitter = createCanvasToolsEmitter();
      emitter.on("add_shape", (payload) => pendingShapeEvents.push(payload));
      emitter.on("move_shapes", (payload) => pendingMoveEvents.push(payload));
      emitter.on("resize_shapes", (payload) =>
        pendingResizeEvents.push(payload),
      );
      emitter.on("update_shape_meta", (payload) =>
        pendingMetaEvents.push(payload),
      );

      // Helper to flush all pending canvas events to the SSE stream
      async function drainCanvasEvents() {
        while (pendingShapeEvents.length > 0) {
          const instruction = pendingShapeEvents.shift()!;
          logger?.logShapeEvent(instruction);
          await stream.writeSSE({
            data: JSON.stringify({ type: "canvas_add_shape", instruction }),
            event: "canvas_add_shape",
          });
        }
        while (pendingMoveEvents.length > 0) {
          const payload = pendingMoveEvents.shift()!;
          await stream.writeSSE({
            data: JSON.stringify({ type: "canvas_move_shapes", payload }),
            event: "canvas_move_shapes",
          });
        }
        while (pendingResizeEvents.length > 0) {
          const payload = pendingResizeEvents.shift()!;
          await stream.writeSSE({
            data: JSON.stringify({ type: "canvas_resize_shapes", payload }),
            event: "canvas_resize_shapes",
          });
        }
        while (pendingMetaEvents.length > 0) {
          const payload = pendingMetaEvents.shift()!;
          await stream.writeSSE({
            data: JSON.stringify({
              type: "canvas_update_shape_meta",
              payload,
            }),
            event: "canvas_update_shape_meta",
          });
        }
      }

      try {
        // Build MCP servers config — add canvas tools if projectId is provided
        const mcpServers: Record<
          string,
          ReturnType<typeof createCanvasToolsServer>
        > = {};
        const allowedTools: string[] = [];

        if (projectId) {
          mcpServers["canvas-tools"] = createCanvasToolsServer(
            projectId,
            userId,
            emitter,
          );
          allowedTools.push(...CANVAS_TOOL_NAMES);
        }

        const hasCanvasTools = Object.keys(mcpServers).length > 0;

        // Include Read/Write for workspace file access
        allowedTools.push("Read", "Write");

        const queryResult = query({
          prompt,
          options: {
            systemPrompt: buildSystemPrompt(hasCanvasTools),
            cwd: workspacePath,
            // Use full path to node binary so the SDK can find it regardless of
            // how the server was started (nvm, volta, etc.)
            executable: process.execPath as "node",
            env: { ...process.env },
            sandbox: {
              enabled: true,
              autoAllowBashIfSandboxed: true,
              network: { allowLocalBinding: true },
            },
            permissionMode: "acceptEdits",
            maxTurns: 30,
            includePartialMessages: true,
            allowedTools,
            ...(sessionId ? { resume: sessionId } : {}),
            ...(hasCanvasTools ? { mcpServers } : {}),
          },
        });

        for await (const msg of queryResult) {
          logger?.logSdkMessage(msg);

          // Drain any canvas events queued by tool handlers
          await drainCanvasEvents();

          const messages = transformMessage(msg, state);
          for (const m of messages) {
            await stream.writeSSE({
              data: JSON.stringify(m),
              event: m.type,
            });
          }
        }

        await drainCanvasEvents();
        logger?.logDone();
      } catch (error) {
        // Flush any canvas events that succeeded before the error
        await drainCanvasEvents();
        console.error("[Agent] Error:", error);
        logger?.logError(error);
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
          event: "error",
        });
      }
    });
  },
);

/**
 * Per-request state used during message transformation
 */
interface TransformState {
  /** Whether we have an un-finalized text block streaming */
  hasOpenText: boolean;
  /** Map tool_use block id → tool name for matching results */
  toolUseIdToName: Map<string, string>;
}

/**
 * Transform a single SDK message into our message model.
 *
 * Key insight: when the message type changes (e.g. text → tool_use),
 * we emit a "text_done" to finalize the previous text block.
 */
function transformMessage(msg: unknown, state: TransformState): AgentMessage[] {
  const out: AgentMessage[] = [];
  const message = msg as Record<string, unknown>;

  // System init
  if (message.type === "system" && message.subtype === "init") {
    out.push({ type: "system", sessionId: message.session_id as string });
  }

  // Streaming text delta
  if (message.type === "stream_event") {
    const event = message.event as Record<string, unknown>;
    if (event?.type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown>;
      if (delta?.type === "text_delta" && delta?.text) {
        state.hasOpenText = true;
        out.push({ type: "text_delta", content: delta.text as string });
      }
    }
  }

  // Assistant message with content blocks (tool_use, tool_result, text)
  if (message.type === "assistant") {
    const assistantMsg = message.message as Record<string, unknown>;
    const content = assistantMsg?.content as Array<Record<string, unknown>>;

    if (Array.isArray(content)) {
      for (const block of content) {
        // tool_use block — finalize any open text first
        if (block.type === "tool_use") {
          if (state.hasOpenText) {
            out.push({ type: "text_done" });
            state.hasOpenText = false;
          }

          const toolId = block.id as string;
          const toolName = block.name as string;
          if (toolId && toolName) {
            state.toolUseIdToName.set(toolId, toolName);
          }

          out.push({
            type: "tool_use",
            toolId,
            tool: toolName,
            input: block.input,
          });
        }

        // tool_result block — matches a previous tool_use
        if (block.type === "tool_result") {
          const toolId = block.tool_use_id as string;
          out.push({
            type: "tool_result",
            toolId,
            output:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
          });
        }
      }
    }
  }

  // Result — finalize any open text, then emit result
  if (message.type === "result") {
    if (state.hasOpenText) {
      out.push({ type: "text_done" });
      state.hasOpenText = false;
    }

    const usage = message.usage as Record<string, number>;
    out.push({
      type: "result",
      cost: (message.total_cost_usd as number) || 0,
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
    });
  }

  return out;
}

export default agentRoute;
