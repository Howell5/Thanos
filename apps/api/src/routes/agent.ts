import { query } from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// Request schema
const runAgentSchema = z.object({
  prompt: z.string().min(1),
  workspacePath: z.string().min(1),
});

// Simplified event types for frontend
type AgentEvent =
  | { type: "system"; sessionId: string }
  | { type: "thinking"; content: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; tool: string; output: string }
  | { type: "message"; content: string }
  | { type: "done"; cost: number; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string };

const agentRoute = new Hono().post(
  "/run",
  zValidator("json", runAgentSchema),
  async (c) => {
    const { prompt, workspacePath } = c.req.valid("json");

    return streamSSE(c, async (stream) => {
      try {
        const queryResult = query({
          prompt,
          options: {
            cwd: workspacePath,
            sandbox: {
              enabled: true,
              autoAllowBashIfSandboxed: true,
              network: {
                allowLocalBinding: true,
              },
            },
            permissionMode: "acceptEdits",
            maxTurns: 30,
            // Include partial messages for streaming text
            includePartialMessages: true,
          },
        });

        for await (const message of queryResult) {
          const events = transformMessage(message);
          for (const event of events) {
            await stream.writeSSE({
              data: JSON.stringify(event),
              event: event.type,
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
  },
);

/**
 * Transform SDK messages to simplified frontend events
 */
function transformMessage(msg: unknown): AgentEvent[] {
  const events: AgentEvent[] = [];
  const message = msg as Record<string, unknown>;

  // System init message
  if (message.type === "system" && message.subtype === "init") {
    events.push({
      type: "system",
      sessionId: message.session_id as string,
    });
  }

  // Assistant message with content blocks
  if (message.type === "assistant") {
    const assistantMsg = message.message as Record<string, unknown>;
    const content = assistantMsg?.content as Array<Record<string, unknown>>;

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text") {
          events.push({
            type: "thinking",
            content: block.text as string,
          });
        }

        if (block.type === "tool_use") {
          events.push({
            type: "tool_start",
            tool: block.name as string,
            input: block.input,
          });
        }

        if (block.type === "tool_result") {
          events.push({
            type: "tool_end",
            tool: (block.tool_use_id as string) || "unknown",
            output:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
          });
        }
      }
    }
  }

  // Streaming partial message
  if (message.type === "stream_event") {
    const event = message.event as Record<string, unknown>;
    if (event?.type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown>;
      if (delta?.type === "text_delta" && delta?.text) {
        events.push({
          type: "thinking",
          content: delta.text as string,
        });
      }
    }
  }

  // Result message
  if (message.type === "result") {
    const usage = message.usage as Record<string, number>;
    events.push({
      type: "done",
      cost: (message.total_cost_usd as number) || 0,
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
    });
  }

  return events;
}

export default agentRoute;
