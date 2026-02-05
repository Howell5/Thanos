import { Button } from "@/components/ui/button";
import {
  selectCanStart,
  selectIsRunning,
  useAgentStore,
} from "@/stores/use-agent-store";
import { Loader2, Play, RotateCcw, Square } from "lucide-react";
import { useCallback, useState } from "react";

/**
 * AgentPanel - Control panel for running AI Agent
 *
 * Features:
 * - Prompt input textarea
 * - Run/Stop/Reset buttons based on state
 * - Status display (idle/running/done/error)
 * - Cost and token statistics after completion
 */
export function AgentPanel() {
  const [prompt, setPrompt] = useState("");

  // Agent store state
  const status = useAgentStore((s) => s.status);
  const error = useAgentStore((s) => s.error);
  const cost = useAgentStore((s) => s.cost);
  const inputTokens = useAgentStore((s) => s.inputTokens);
  const outputTokens = useAgentStore((s) => s.outputTokens);
  const isRunning = useAgentStore(selectIsRunning);
  const canStart = useAgentStore(selectCanStart);

  // Actions
  const start = useAgentStore((s) => s.start);
  const stop = useAgentStore((s) => s.stop);
  const reset = useAgentStore((s) => s.reset);

  const handleRun = useCallback(() => {
    if (prompt.trim() && canStart) {
      start(prompt.trim());
    }
  }, [prompt, canStart, start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleReset = useCallback(() => {
    reset();
    setPrompt("");
  }, [reset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter to run
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun],
  );

  // Status indicator
  const getStatusDisplay = () => {
    switch (status) {
      case "idle":
        return { text: "Ready", color: "text-gray-500" };
      case "running":
        return { text: "Running...", color: "text-blue-500" };
      case "done":
        return { text: "Completed", color: "text-green-500" };
      case "error":
        return { text: "Error", color: "text-red-500" };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[300] w-[500px] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      {/* Status bar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              status === "running"
                ? "animate-pulse bg-blue-500"
                : status === "done"
                  ? "bg-green-500"
                  : status === "error"
                    ? "bg-red-500"
                    : "bg-gray-400"
            }`}
          />
          <span className={`text-sm font-medium ${statusDisplay.color}`}>
            {statusDisplay.text}
          </span>
        </div>

        {/* Stats (shown after completion) */}
        {status === "done" && cost !== null && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>💰 ${cost.toFixed(4)}</span>
            <span>
              📊 {inputTokens} / {outputTokens} tokens
            </span>
          </div>
        )}
      </div>

      {/* Error message */}
      {status === "error" && error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter your prompt... (Cmd/Ctrl + Enter to run)"
        disabled={isRunning}
        className="mb-3 h-24 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          Workspace: ~/Thanos/workspaces/test-project
        </div>

        <div className="flex items-center gap-2">
          {/* Reset button (always visible, disabled when running) */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isRunning}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>

          {/* Run/Stop button */}
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              className="gap-1.5"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!prompt.trim() || !canStart}
              className="gap-1.5"
            >
              {status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
