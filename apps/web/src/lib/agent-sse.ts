import { env } from "../env";

/**
 * Agent event types from the backend SSE stream
 */
export type AgentEvent =
  | { type: "system"; sessionId: string }
  | { type: "thinking"; content: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; tool: string; output: string }
  | { type: "message"; content: string }
  | { type: "done"; cost: number; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string };

export interface AgentRunParams {
  prompt: string;
  workspacePath: string;
}

/**
 * Subscribe to Agent SSE stream
 * Returns an abort function to cancel the stream
 */
export function subscribeAgentSSE(
  params: AgentRunParams,
  onEvent: (event: AgentEvent) => void,
): () => void {
  const controller = new AbortController();

  // Use fetch for SSE since EventSource doesn't support POST
  fetch(`${env.VITE_API_URL}/api/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) {
        onEvent({ type: "error", message: `HTTP ${response.status}: ${response.statusText}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ type: "error", message: "No response body" });
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
              const event = JSON.parse(line.slice(6)) as AgentEvent;
              onEvent(event);
            } catch {
              // Incomplete JSON, save for next chunk
              buffer = lines.slice(i).join("\n");
              break;
            }
          } else if (line !== "" && !line.startsWith("event:")) {
            // Keep non-empty, non-event lines in buffer
            buffer += line + "\n";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onEvent({ type: "error", message: err.message || "Connection failed" });
      }
    });

  return () => controller.abort();
}
