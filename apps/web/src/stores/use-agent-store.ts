import { type AgentMessage, type MentionedShapeContext, subscribeAgentSSE } from "@/lib/agent-sse";
import {
  requestCanvasAddShape,
  requestCanvasMoveShapes,
  requestCanvasResizeShapes,
  requestCanvasUpdateShapeMeta,
} from "@/lib/canvas-events";
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
 * Per-project chat session data
 */
interface ProjectSession {
  sessionId: string | null;
  messages: ChatMessage[];
  status: AgentStatus;
  error: string | null;
}

/**
 * Agent store state
 */
interface AgentState {
  /** Current active project chat data (derived from sessions map) */
  status: AgentStatus;
  sessionId: string | null;
  error: string | null;
  messages: ChatMessage[];

  /** Configuration */
  workspacePath: string;
  projectId: string | null;

  /** Per-project session storage */
  sessions: Record<string, ProjectSession>;

  /** Internal abort function */
  _abortFn: (() => void) | null;

  // Actions
  setWorkspacePath: (path: string) => void;
  setProjectId: (id: string | null) => void;
  sendMessage: (prompt: string, mentionedShapes?: MentionedShapeContext[]) => void;
  stop: () => void;
  reset: () => void;
  restoreSession: (
    projectId: string,
    data: { sessionId: string | null; messages: ChatMessage[]; status: AgentStatus },
  ) => void;
}

const DEFAULT_WORKSPACE_PATH = (() => {
  const p = import.meta.env.VITE_WORKSPACE_PATH;
  if (!p) {
    console.warn("[Agent] VITE_WORKSPACE_PATH is not set in .env — agent workspace will not work correctly.");
  }
  return p || "";
})();

const EMPTY_SESSION: ProjectSession = {
  sessionId: null,
  messages: [],
  status: "idle",
  error: null,
};

/**
 * Save current active state back into sessions map
 */
function saveCurrentSession(state: AgentState): Record<string, ProjectSession> {
  if (!state.projectId) return state.sessions;
  return {
    ...state.sessions,
    [state.projectId]: {
      sessionId: state.sessionId,
      messages: state.messages,
      status: state.status === "running" ? "error" : state.status,
      error: state.error,
    },
  };
}

/**
 * Load session data for a project from sessions map
 */
function loadSession(sessions: Record<string, ProjectSession>, projectId: string): ProjectSession {
  return sessions[projectId] ?? EMPTY_SESSION;
}

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
      sessions: {},
      _abortFn: null,

      setWorkspacePath: (path: string) => set({ workspacePath: path }),

      setProjectId: (id: string | null) => {
        const state = get();

        // Same project, no-op
        if (state.projectId === id) return;

        // Stop any running agent
        state._abortFn?.();

        // Save current project's session
        const updatedSessions = saveCurrentSession(state);

        // Load target project's session
        const target = id ? loadSession(updatedSessions, id) : EMPTY_SESSION;

        set({
          projectId: id,
          sessions: updatedSessions,
          sessionId: target.sessionId,
          messages: target.messages,
          status: target.status,
          error: target.error,
          _abortFn: null,
        });
      },

      sendMessage: (prompt: string, mentionedShapes?: MentionedShapeContext[]) => {
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
            ...(mentionedShapes?.length ? { mentionedShapes } : {}),
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
        const state = get();
        state._abortFn?.();

        const newState: Partial<AgentState> = {
          status: "idle",
          sessionId: null,
          error: null,
          messages: [],
          _abortFn: null,
        };

        // Also clear this project's persisted session
        if (state.projectId) {
          const { [state.projectId]: _, ...rest } = state.sessions;
          newState.sessions = rest;
        }

        set(newState);
      },

      restoreSession: (projectId, data) => {
        const state = get();
        // Only restore if this project is active and local messages are empty
        if (state.projectId !== projectId || state.messages.length > 0) return;

        const session: ProjectSession = {
          sessionId: data.sessionId,
          messages: data.messages,
          status: data.status,
          error: null,
        };

        set({
          sessionId: session.sessionId,
          messages: session.messages,
          status: session.status,
          error: null,
          sessions: { ...state.sessions, [projectId]: session },
        });
      },
    }),
    {
      name: "agent-chat",
      partialize: (state) => ({
        // Persist the sessions map (merge current active state first)
        sessions: saveCurrentSession(state),
        projectId: state.projectId,
      }),
      // On rehydrate, restore active project's session from the map
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.projectId && state.sessions[state.projectId]) {
          const session = state.sessions[state.projectId];
          state.sessionId = session.sessionId;
          state.messages = session.messages;
          state.status = session.status;
          state.error = session.error;
        }
      },
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

    case "canvas_add_shape": {
      // Delegate to canvas event bus — store stays canvas-agnostic
      requestCanvasAddShape(msg.instruction);
      return;
    }
    case "canvas_move_shapes": {
      requestCanvasMoveShapes(msg.payload);
      return;
    }
    case "canvas_resize_shapes": {
      requestCanvasResizeShapes(msg.payload);
      return;
    }
    case "canvas_update_shape_meta": {
      requestCanvasUpdateShapeMeta(msg.payload);
      return;
    }
  }
}

// ─── Selectors ──────────────────────────────────────────────

export const selectIsRunning = (s: AgentState) => s.status === "running";
export const selectCanStart = (s: AgentState) =>
  s.status === "idle" || s.status === "done" || s.status === "error";
