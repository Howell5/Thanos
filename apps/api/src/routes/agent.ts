import { query } from "@anthropic-ai/claude-agent-sdk";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { createVideoToolsServer, VIDEO_TOOL_NAMES } from "../agent/tools/video-tools";

// Request schema
const runAgentSchema = z.object({
  prompt: z.string().min(1),
  workspacePath: z.string().min(1),
  sessionId: z.string().optional(),
  projectId: z.string().uuid().optional().describe("Project ID for video tools access"),
});

/**
 * Message-based event model.
 *
 * Instead of raw events (thinking, tool_start, tool_end), we emit
 * finalized "message snapshots":
 *
 * - text_delta: streaming text fragment (append to current text message)
 * - text_done: the accumulated text block is finalized
 * - tool_use: a tool was invoked (complete: tool name + input + output if available)
 * - system: session init
 * - result: agent finished (cost, tokens)
 * - error: something went wrong
 */
type AgentMessage =
  | { type: "system"; sessionId: string }
  | { type: "text_delta"; content: string }
  | { type: "text_done" }
  | { type: "tool_use"; toolId: string; tool: string; input: unknown }
  | { type: "tool_result"; toolId: string; output: string }
  | { type: "result"; cost: number; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string };

const agentRoute = new Hono().post("/run", zValidator("json", runAgentSchema), async (c) => {
  const { prompt, workspacePath, sessionId, projectId } = c.req.valid("json");

  return streamSSE(c, async (stream) => {
    // Per-request state for message transformation
    const state = {
      hasOpenText: false,
      toolUseIdToName: new Map<string, string>(),
    };

    try {
      // Build MCP servers config - add video tools if projectId is provided
      const mcpServers: Record<string, ReturnType<typeof createVideoToolsServer>> = {};
      const allowedTools: string[] = [];

      if (projectId) {
        mcpServers["video-tools"] = createVideoToolsServer(projectId);
        allowedTools.push(...VIDEO_TOOL_NAMES);
      }

      const queryResult = query({
        prompt,
        options: {
          cwd: workspacePath,
          env: { ...process.env },
          sandbox: {
            enabled: true,
            autoAllowBashIfSandboxed: true,
            network: { allowLocalBinding: true },
          },
          permissionMode: "acceptEdits",
          maxTurns: 30,
          includePartialMessages: true,
          ...(sessionId ? { resume: sessionId } : {}),
          // Add video tools if available
          ...(Object.keys(mcpServers).length > 0
            ? { mcpServers, allowedTools: [...allowedTools] }
            : {}),
        },
      });

      for await (const msg of queryResult) {
        const messages = transformMessage(msg, state);
        for (const m of messages) {
          await stream.writeSSE({
            data: JSON.stringify(m),
            event: m.type,
          });
        }
      }
    } catch (error) {
      console.error("[Agent] Error:", error);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
        event: "error",
      });
    }
  });
});

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
              typeof block.content === "string" ? block.content : JSON.stringify(block.content),
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
