import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/stores/use-agent-store";
import { selectCanStart, selectIsRunning, useAgentStore } from "@/stores/use-agent-store";
import { ChevronRight, Loader2, Play, RotateCcw, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Props ──────────────────────────────────────────────────

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Message Components ─────────────────────────────────────

function TextMessage({ content, finalized }: { content: string; finalized: boolean }) {
  return (
    <div className="mx-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
        {!finalized && <Loader2 className="h-3 w-3 animate-spin" />}
        Thinking
      </div>
      <div className="max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
        {content}
      </div>
    </div>
  );
}

function ToolMessage({
  tool,
  input,
  output,
  completed,
}: {
  tool: string;
  input: unknown;
  output?: string;
  completed: boolean;
}) {
  const inputPreview =
    typeof input === "string" ? input.slice(0, 100) : (JSON.stringify(input)?.slice(0, 100) ?? "");

  // Special rendering for AskUserQuestion
  if (tool === "AskUserQuestion") {
    return <AskUserQuestionMessage input={input} />;
  }

  return (
    <div className="mx-3 flex items-start gap-2 py-1.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {completed ? (
          <span className="text-xs text-green-500">✓</span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-slate-700">{tool}</span>
        {inputPreview && <p className="truncate text-[11px] text-slate-400">{inputPreview}</p>}
        {output && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
            {output.length > 150 ? `${output.slice(0, 150)}...` : output}
          </p>
        )}
      </div>
    </div>
  );
}

function AskUserQuestionMessage({ input }: { input: unknown }) {
  const data = input as {
    questions?: Array<{
      question: string;
      options?: Array<{ label: string; description?: string }>;
    }>;
  };
  const questions = data?.questions;

  if (!Array.isArray(questions)) {
    return (
      <div className="mx-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600">
        Agent is asking a question...
      </div>
    );
  }

  return (
    <div className="mx-3 space-y-2">
      {questions.map((q) => (
        <div key={q.question} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="mb-1.5 text-xs font-medium text-slate-700">{q.question}</p>
          {q.options && (
            <div className="space-y-1">
              {q.options.map((opt) => (
                <div key={opt.label} className="rounded border border-blue-100 bg-white px-2 py-1">
                  <span className="text-[11px] font-medium text-slate-600">{opt.label}</span>
                  {opt.description && (
                    <p className="text-[10px] text-slate-400">{opt.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="mx-3 flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-blue-500 px-3 py-2 text-xs text-white">
        <div className="whitespace-pre-wrap break-words leading-relaxed">{content}</div>
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mx-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
      {message}
    </div>
  );
}

function ResultMessage({
  cost,
  inputTokens,
  outputTokens,
}: {
  cost: number;
  inputTokens: number;
  outputTokens: number;
}) {
  return (
    <div className="mx-3 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
      <span>${cost.toFixed(4)}</span>
      <span>{inputTokens.toLocaleString()} in</span>
      <span>{outputTokens.toLocaleString()} out</span>
    </div>
  );
}

// ─── Message Renderer ───────────────────────────────────────

function MessageRenderer({ msg, toolCompleted }: { msg: ChatMessage; toolCompleted?: boolean }) {
  switch (msg.type) {
    case "text":
      return <TextMessage content={msg.content} finalized={msg.finalized} />;
    case "tool":
      return (
        <ToolMessage
          tool={msg.tool}
          input={msg.input}
          output={msg.output}
          completed={toolCompleted ?? true}
        />
      );
    case "user":
      return <UserMessage content={msg.content} />;
    case "error":
      return <ErrorMessage message={msg.message} />;
    case "result":
      return (
        <ResultMessage
          cost={msg.cost}
          inputTokens={msg.inputTokens}
          outputTokens={msg.outputTokens}
        />
      );
    default:
      return null;
  }
}

// ─── Main Component ─────────────────────────────────────────

export function AgentChatPanel({ open, onClose }: AgentChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

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
      sendMessage(prompt.trim());
      setPrompt("");
    }
  }, [prompt, canStart, sendMessage]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleReset = useCallback(() => {
    reset();
    setPrompt("");
  }, [reset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun],
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

      {/* Message Feed */}
      <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto py-3">
        {messages.length === 0 && !isRunning && (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Enter a prompt to start
          </div>
        )}

        {messages.map((msg, i) => {
          // A tool is completed if anything comes after it, or agent is no longer running.
          // Only the very last tool with no subsequent messages while running shows loading.
          let toolCompleted: boolean | undefined;
          if (msg.type === "tool") {
            const hasSubsequentMessage = i < messages.length - 1;
            toolCompleted = hasSubsequentMessage || !isRunning;
          }
          return (
            <MessageRenderer key={`${msg.type}-${i}`} msg={msg} toolCompleted={toolCompleted} />
          );
        })}

        {/* Show store error if not in messages */}
        {status === "error" && error && messages.every((m) => m.type !== "error") && (
          <ErrorMessage message={error} />
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-100 p-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            hasSession ? "Continue conversation... (⌘+Enter)" : "Enter prompt... (⌘+Enter to run)"
          }
          disabled={isRunning}
          rows={3}
          className="mb-2 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <span className="truncate text-[10px] text-gray-400">~/workspaces/test-project</span>
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
      className="pointer-events-auto fixed bottom-4 right-4 z-[300] flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg transition-colors hover:bg-gray-50"
    >
      <div className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-xs font-medium text-slate-600">Agent</span>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
    </button>
  );
}
