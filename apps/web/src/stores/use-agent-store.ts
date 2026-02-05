import { type AgentEvent, subscribeAgentSSE } from "@/lib/agent-sse";
import { create } from "zustand";

/**
 * Agent execution status
 */
export type AgentStatus = "idle" | "running" | "done" | "error";

/**
 * Agent store state
 */
interface AgentState {
  // Connection state
  status: AgentStatus;
  sessionId: string | null;
  error: string | null;

  // Events received from SSE
  events: AgentEvent[];

  // Accumulated thinking content (for streaming text)
  thinkingContent: string;

  // Completion stats
  cost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;

  // Configuration
  workspacePath: string;

  // Internal - abort function
  _abortFn: (() => void) | null;

  // Actions
  setWorkspacePath: (path: string) => void;
  start: (prompt: string) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Default workspace path for local development
 */
const DEFAULT_WORKSPACE_PATH = "/Users/willhong/Code/Work/Thanos/workspaces/test-project";

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  status: "idle",
  sessionId: null,
  error: null,
  events: [],
  thinkingContent: "",
  cost: null,
  inputTokens: null,
  outputTokens: null,
  workspacePath: DEFAULT_WORKSPACE_PATH,
  _abortFn: null,

  // Actions
  setWorkspacePath: (path: string) => {
    set({ workspacePath: path });
  },

  start: (prompt: string) => {
    const { workspacePath, _abortFn } = get();

    // Stop any existing run
    if (_abortFn) {
      _abortFn();
    }

    // Reset state
    set({
      status: "running",
      sessionId: null,
      error: null,
      events: [],
      thinkingContent: "",
      cost: null,
      inputTokens: null,
      outputTokens: null,
    });

    // Start SSE subscription
    const abort = subscribeAgentSSE({ prompt, workspacePath }, (event) => {
      const state = get();

      // Add event to list
      const newEvents = [...state.events, event];

      switch (event.type) {
        case "system":
          set({
            events: newEvents,
            sessionId: event.sessionId,
          });
          break;

        case "thinking":
          // Accumulate thinking content
          set({
            events: newEvents,
            thinkingContent: state.thinkingContent + event.content,
          });
          break;

        case "tool_start":
        case "tool_end":
        case "message":
          set({ events: newEvents });
          break;

        case "done":
          set({
            events: newEvents,
            status: "done",
            cost: event.cost,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            _abortFn: null,
          });
          break;

        case "error":
          set({
            events: newEvents,
            status: "error",
            error: event.message,
            _abortFn: null,
          });
          break;
      }
    });

    set({ _abortFn: abort });
  },

  stop: () => {
    const { _abortFn } = get();
    if (_abortFn) {
      _abortFn();
    }
    set({
      status: "idle",
      _abortFn: null,
    });
  },

  reset: () => {
    const { _abortFn } = get();
    if (_abortFn) {
      _abortFn();
    }
    set({
      status: "idle",
      sessionId: null,
      error: null,
      events: [],
      thinkingContent: "",
      cost: null,
      inputTokens: null,
      outputTokens: null,
      _abortFn: null,
    });
  },
}));

/**
 * Selectors for computed values
 */
export const selectIsRunning = (state: AgentState) => state.status === "running";
export const selectCanStart = (state: AgentState) => state.status === "idle" || state.status === "done" || state.status === "error";
export const selectToolEvents = (state: AgentState) =>
  state.events.filter((e) => e.type === "tool_start" || e.type === "tool_end");
