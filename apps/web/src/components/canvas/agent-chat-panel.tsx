import { Button } from "@/components/ui/button";
import { useMentionInput } from "@/hooks/use-mention-input";
import { coalesceMessages } from "@/lib/agent-turns";
import { selectCanStart, selectIsRunning, useAgentStore } from "@/stores/use-agent-store";
import type { CanvasShapeSummary } from "@/stores/use-canvas-shape-store";
import { ChevronRight, Play, RotateCcw, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TurnView } from "./agent-turn-segments";
import { ShapeMentionPicker } from "./shape-mention-picker";

// ─── Props ──────────────────────────────────────────────────

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Main Component ─────────────────────────────────────────

export function AgentChatPanel({ open, onClose }: AgentChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [mentionedShapes, setMentionedShapes] = useState<CanvasShapeSummary[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention input hook
  const {
    mentionState,
    handleChange,
    handleKeyDown: handleMentionKeyDown,
    insertMention,
    closeMention,
  } = useMentionInput(prompt, setPrompt, textareaRef);

  // Store state
  const status = useAgentStore((s) => s.status);
  const messages = useAgentStore((s) => s.messages);
  const error = useAgentStore((s) => s.error);
  const isRunning = useAgentStore(selectIsRunning);
  const canStart = useAgentStore(selectCanStart);

  // Actions
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const stop = useAgentStore((s) => s.stop);
  const reset = useAgentStore((s) => s.reset);
  const sessionId = useAgentStore((s) => s.sessionId);
  const hasSession = sessionId !== null;

  // Coalesce messages into turns
  const turns = useMemo(() => coalesceMessages(messages, status), [messages, status]);

  // Auto-scroll
  const msgCount = messages.length;
  const lastMsg = messages[msgCount - 1];
  const scrollTrigger = lastMsg?.type === "text" ? lastMsg.content.length : msgCount;
  useEffect(() => {
    if (feedRef.current && scrollTrigger > 0) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [scrollTrigger]);

  const handleRun = useCallback(() => {
    if (prompt.trim() && canStart) {
      // Reconcile: only include shapes whose @[brief] tag is still in the prompt
      const activeShapes = mentionedShapes.filter((s) => prompt.includes(`@[${s.brief}]`));
      sendMessage(prompt.trim(), activeShapes.length > 0 ? activeShapes : undefined);
      setPrompt("");
      setMentionedShapes([]);
    }
  }, [prompt, canStart, sendMessage, mentionedShapes]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleReset = useCallback(() => {
    reset();
    setPrompt("");
    setMentionedShapes([]);
  }, [reset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let mention picker handle keys first when open
      handleMentionKeyDown(e);
      if (e.defaultPrevented) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun, handleMentionKeyDown],
  );

  const handleMentionSelect = useCallback(
    (shape: CanvasShapeSummary) => {
      insertMention(shape);
      setMentionedShapes((prev) => (prev.some((s) => s.id === shape.id) ? prev : [...prev, shape]));
    },
    [insertMention],
  );

  const statusConfig = {
    idle: { text: "Ready", dotClass: "bg-gray-400" },
    running: { text: "Running", dotClass: "animate-pulse bg-blue-500" },
    done: { text: "Completed", dotClass: "bg-green-500" },
    error: { text: "Error", dotClass: "bg-red-500" },
  }[status];

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed right-0 top-0 z-[300] flex h-full w-[380px] flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${statusConfig.dotClass}`} />
          <span className="text-sm font-medium text-slate-700">Agent — {statusConfig.text}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Message Feed — now uses coalesced turns */}
      <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto py-3">
        {turns.length === 0 && !isRunning && (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Enter a prompt to start
          </div>
        )}

        {turns.map((turn) => (
          <TurnView key={turn.turnId} turn={turn} />
        ))}

        {/* Show store error if not captured in any turn */}
        {status === "error" && error && turns.every((t) => !t.error) && (
          <div className="mx-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="relative border-t border-gray-100 p-3">
        {mentionState.isOpen && mentionState.anchorRect && (
          <ShapeMentionPicker
            query={mentionState.query}
            anchorRect={mentionState.anchorRect}
            activeIndex={mentionState.activeIndex}
            onSelect={handleMentionSelect}
            onClose={closeMention}
          />
        )}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            hasSession
              ? "Continue conversation... (@ to mention shapes, ⌘+Enter)"
              : "Enter prompt... (@ to mention shapes, ⌘+Enter to run)"
          }
          disabled={isRunning}
          rows={3}
          className="mb-2 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isRunning}
              className="h-7 gap-1 px-2 text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
            {isRunning ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                className="h-7 gap-1 px-2 text-xs"
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRun}
                disabled={!prompt.trim() || !canStart}
                className="h-7 gap-1 px-2 text-xs"
              >
                {hasSession ? <Send className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {hasSession ? "Send" : "Run"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle Button ──────────────────────────────────────────

export function AgentPanelToggle({ onClick }: { onClick: () => void }) {
  const status = useAgentStore((s) => s.status);

  const dotClass = {
    idle: "bg-gray-400",
    running: "animate-pulse bg-blue-500",
    done: "bg-green-500",
    error: "bg-red-500",
  }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto fixed right-4 top-1/2 z-[300] flex -translate-y-1/2 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg transition-colors hover:bg-gray-50"
    >
      <div className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-xs font-medium text-slate-600">Agent</span>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
    </button>
  );
}
