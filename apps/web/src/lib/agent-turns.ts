import type { AgentStatus, ChatMessage } from "@/stores/use-agent-store";

// ─── Types ──────────────────────────────────────────────────

export type TurnSegment =
  | { kind: "text"; content: string; finalized: boolean }
  | { kind: "tool"; toolId: string; tool: string; input: unknown; output?: string };

export interface AgentTurn {
  /** Stable ID: "turn-0", "turn-1", ... */
  turnId: string;
  role: "user" | "assistant";
  /** Text content for user turns */
  userContent?: string;
  /** Content segments for assistant turns */
  segments: TurnSegment[];
  /** Whether this turn is still streaming */
  streaming: boolean;
  /** Token usage stats (set when turn completes) */
  result?: { cost: number; inputTokens: number; outputTokens: number };
  /** Error message if the turn failed */
  error?: string;
}

// ─── Coalesce Logic ─────────────────────────────────────────

/**
 * Coalesce flat ChatMessage[] into logical AgentTurn[].
 *
 * Rules:
 * 1. "user" message → creates a user turn, prepares next assistant turn
 * 2. "text" message → appends as text segment to current assistant turn
 * 3. "tool" message → appends as tool segment to current assistant turn
 * 4. "result" message → attaches stats to current assistant turn, marks not streaming
 * 5. "error" message → attaches error to current assistant turn
 */
export function coalesceMessages(messages: ChatMessage[], status: AgentStatus): AgentTurn[] {
  const turns: AgentTurn[] = [];
  let currentAssistant: AgentTurn | null = null;
  let turnIndex = 0;

  const pushAssistant = () => {
    if (currentAssistant && currentAssistant.segments.length > 0) {
      turns.push(currentAssistant);
    }
    currentAssistant = null;
  };

  const ensureAssistant = (): AgentTurn => {
    if (!currentAssistant) {
      currentAssistant = {
        turnId: `turn-${turnIndex++}`,
        role: "assistant",
        segments: [],
        streaming: true,
      };
    }
    return currentAssistant;
  };

  for (const msg of messages) {
    switch (msg.type) {
      case "user": {
        // Finalize any pending assistant turn
        pushAssistant();
        // Create user turn
        turns.push({
          turnId: `turn-${turnIndex++}`,
          role: "user",
          userContent: msg.content,
          segments: [],
          streaming: false,
        });
        // Reset assistant for next round
        currentAssistant = null;
        break;
      }

      case "text": {
        const turn = ensureAssistant();
        turn.segments.push({
          kind: "text",
          content: msg.content,
          finalized: msg.finalized,
        });
        break;
      }

      case "tool": {
        const turn = ensureAssistant();
        turn.segments.push({
          kind: "tool",
          toolId: msg.toolId,
          tool: msg.tool,
          input: msg.input,
          output: msg.output,
        });
        break;
      }

      case "result": {
        const turn = ensureAssistant();
        turn.result = {
          cost: msg.cost,
          inputTokens: msg.inputTokens,
          outputTokens: msg.outputTokens,
        };
        turn.streaming = false;
        break;
      }

      case "error": {
        const turn = ensureAssistant();
        turn.error = msg.message;
        turn.streaming = false;
        break;
      }
    }
  }

  // Push any remaining assistant turn
  if (currentAssistant !== null) {
    const remaining: AgentTurn = currentAssistant;
    if (status !== "running") {
      remaining.streaming = false;
    }
    if (remaining.segments.length > 0) {
      turns.push(remaining);
    }
  }

  return turns;
}
