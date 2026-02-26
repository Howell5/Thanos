import type {
  CanvasShapeInstruction,
  MoveShapesPayload,
  ResizeShapesPayload,
  UpdateShapeMetaPayload,
} from "@repo/shared";
import { env } from "../env";

/**
 * Agent message types from the backend SSE stream.
 *
 * Message-based model (not raw events):
 * - text_delta: streaming text fragment, append to current text block
 * - text_done: current text block is finalized
 * - tool_use: a tool was invoked (name + input)
 * - tool_result: result for a previous tool_use (matched by toolId)
 * - canvas_add_shape: agent requested adding a shape to the canvas
 * - system: session init
 * - result: agent finished with cost/token stats
 * - error: something went wrong
 *
 * Keep in sync with apps/api/src/routes/agent.ts
 */
export type AgentMessage =
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

export interface MentionedShapeContext {
  id: string;
  type: string;
  brief: string;
  thumbnailUrl: string | null;
}

export interface AgentRunParams {
  prompt: string;
  workspacePath: string;
  sessionId?: string;
  projectId?: string;
  mentionedShapes?: MentionedShapeContext[];
}

/**
 * Subscribe to Agent SSE stream.
 * Returns an abort function to cancel the stream.
 */
export function subscribeAgentSSE(
  params: AgentRunParams,
  onMessage: (msg: AgentMessage) => void,
): () => void {
  const controller = new AbortController();

  fetch(`${env.VITE_API_URL}/api/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) {
        onMessage({ type: "error", message: `HTTP ${response.status}: ${response.statusText}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onMessage({ type: "error", message: "No response body" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE format: "event: <type>\ndata: <json>\n\n"
        const lines = buffer.split("\n");
        buffer = "";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.startsWith("data: ")) {
            try {
              const msg = JSON.parse(line.slice(6)) as AgentMessage;
              onMessage(msg);
            } catch {
              // Incomplete JSON, save for next chunk
              buffer = lines.slice(i).join("\n");
              break;
            }
          } else if (line !== "" && !line.startsWith("event:")) {
            buffer += `${line}\n`;
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onMessage({ type: "error", message: err.message || "Connection failed" });
      }
    });

  return () => controller.abort();
}
