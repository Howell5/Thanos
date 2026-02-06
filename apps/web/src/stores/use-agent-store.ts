import { type AgentMessage, subscribeAgentSSE } from "@/lib/agent-sse";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ──────────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "done" | "error";

/**
 * A finalized message snapshot in the chat history.
 *
 * Built from raw SSE messages:
 * - text_delta fragments accumulate into a single TextMessage
 * - text_done finalizes that TextMessage
 * - tool_use creates a ToolMessage (output filled in later by tool_result)
 */
export type ChatMessage =
  | { type: "text"; content: string; finalized: boolean }
  | { type: "tool"; toolId: string; tool: string; input: unknown; output?: string }
  | { type: "user"; content: string }
  | { type: "error"; message: string }
  | { type: "result"; cost: number; inputTokens: number; outputTokens: number };

/**
 * Agent store state
 */
interface AgentState {
  status: AgentStatus;
  sessionId: string | null;
  error: string | null;

  /** Chat message list — finalized snapshots + one possible streaming message at the end */
  messages: ChatMessage[];

  /** Configuration */
  workspacePath: string;
  projectId: string | null; // For video tools access

  /** Internal abort function */
  _abortFn: (() => void) | null;

  // Actions
  setWorkspacePath: (path: string) => void;
  setProjectId: (id: string | null) => void;
  sendMessage: (prompt: string) => void;
  stop: () => void;
  reset: () => void;
}

const DEFAULT_WORKSPACE_PATH = "/Users/willhong/Code/Work/Thanos/workspaces/test-project";

// ─── Store ──────────────────────────────────────────────────

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      status: "idle",
      sessionId: null,
      error: null,
      messages: [],
      workspacePath: DEFAULT_WORKSPACE_PATH,
      projectId: null,
      _abortFn: null,

      setWorkspacePath: (path: string) => set({ workspacePath: path }),
      setProjectId: (id: string | null) => set({ projectId: id }),

      sendMessage: (prompt: string) => {
        const { workspacePath, sessionId, projectId, _abortFn } = get();
        if (_abortFn) _abortFn();

        const isResume = sessionId !== null;

        if (isResume) {
          // Continuing existing session — append user message, keep history
          set((prev) => ({
            status: "running",
            error: null,
            messages: [...prev.messages, { type: "user" as const, content: prompt }],
          }));
        } else {
          // New session — clear everything
          set({
            status: "running",
            sessionId: null,
            error: null,
            messages: [{ type: "user" as const, content: prompt }],
          });
        }

        const abort = subscribeAgentSSE(
          {
            prompt,
            workspacePath,
            ...(isResume && sessionId ? { sessionId } : {}),
            ...(projectId ? { projectId } : {}),
          },
          (msg) => {
            applyMessage(msg, get, set);
          },
        );

        set({ _abortFn: abort });
      },

      stop: () => {
        get()._abortFn?.();
        set({ status: "idle", _abortFn: null });
      },

      reset: () => {
        get()._abortFn?.();
        set({
          status: "idle",
          sessionId: null,
          error: null,
          messages: [],
          _abortFn: null,
        });
      },
    }),
    {
      name: "agent-chat",
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages,
        status: state.status === "running" ? ("error" as const) : state.status,
        error: state.error,
        workspacePath: state.workspacePath,
      }),
    },
  ),
);

// ─── Message application logic ──────────────────────────────

type Get = () => AgentState;
type Set = (partial: Partial<AgentState>) => void;

/**
 * Apply a single SSE message to the store.
 *
 * Core logic:
 * - text_delta: append to current streaming text message, or create one
 * - text_done: mark current text message as finalized
 * - tool_use: add a new tool message
 * - tool_result: fill output into matching tool message
 * - result: add result message, set status done
 * - error: add error message, set status error
 */
function applyMessage(msg: AgentMessage, get: Get, set: Set): void {
  const state = get();
  const msgs = [...state.messages];

  switch (msg.type) {
    case "system":
      set({ sessionId: msg.sessionId });
      return;

    case "text_delta": {
      const last = msgs[msgs.length - 1];
      if (last?.type === "text" && !last.finalized) {
        // Append to existing streaming text
        msgs[msgs.length - 1] = { ...last, content: last.content + msg.content };
      } else {
        // Start a new text message
        msgs.push({ type: "text", content: msg.content, finalized: false });
      }
      set({ messages: msgs });
      return;
    }

    case "text_done": {
      const last = msgs[msgs.length - 1];
      if (last?.type === "text" && !last.finalized) {
        msgs[msgs.length - 1] = { ...last, finalized: true };
        set({ messages: msgs });
      }
      return;
    }

    case "tool_use": {
      msgs.push({
        type: "tool",
        toolId: msg.toolId,
        tool: msg.tool,
        input: msg.input,
      });
      set({ messages: msgs });
      return;
    }

    case "tool_result": {
      // Find matching tool message by toolId and fill output
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.type === "tool" && m.toolId === msg.toolId && m.output === undefined) {
          msgs[i] = { ...m, output: msg.output };
          set({ messages: msgs });
          return;
        }
      }
      // No match found — ignore (tool_result without tool_use)
      return;
    }

    case "result": {
      msgs.push({
        type: "result",
        cost: msg.cost,
        inputTokens: msg.inputTokens,
        outputTokens: msg.outputTokens,
      });
      set({ messages: msgs, status: "done", _abortFn: null });
      return;
    }

    case "error": {
      msgs.push({ type: "error", message: msg.message });
      set({ messages: msgs, status: "error", error: msg.message, _abortFn: null });
      return;
    }
  }
}

// ─── Selectors ──────────────────────────────────────────────

export const selectIsRunning = (s: AgentState) => s.status === "running";
export const selectCanStart = (s: AgentState) =>
  s.status === "idle" || s.status === "done" || s.status === "error";
