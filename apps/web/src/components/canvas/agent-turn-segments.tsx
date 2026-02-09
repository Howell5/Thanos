import type { AgentTurn, TurnSegment } from "@/lib/agent-turns";
import { requestCanvasAddVideo } from "@/lib/canvas-events";
import { Film, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

// ─── Video Detection ────────────────────────────────────────

function extractVideoUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s")\]]+\.mp4/);
  return match ? match[0] : null;
}

function extractVideoUrlFromToolOutput(output: string | undefined): string | null {
  if (!output) return null;
  try {
    const data = JSON.parse(output);
    if (data.outputUrl && typeof data.outputUrl === "string" && data.outputUrl.endsWith(".mp4")) {
      return data.outputUrl;
    }
  } catch {
    const match = output.match(/https?:\/\/[^\s"]+\.mp4/);
    if (match) return match[0];
  }
  return null;
}

// ─── Video Result Card ──────────────────────────────────────

function VideoResultCard({ url }: { url: string }) {
  const [added, setAdded] = useState(false);
  const addToCanvas = useCallback(() => {
    requestCanvasAddVideo(url, "Rendered Video");
    setAdded(true);
  }, [url]);

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
      <div className="aspect-video w-full bg-black">
        {/* biome-ignore lint/a11y/useMediaCaption: agent-rendered video */}
        <video src={url} controls preload="metadata" className="h-full w-full object-contain" />
      </div>
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-[10px] font-medium text-emerald-700">Video rendered</span>
        <button
          type="button"
          onClick={addToCanvas}
          disabled={added}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-300"
        >
          <Film className="h-2.5 w-2.5" />
          {added ? "Added" : "Add to Canvas"}
        </button>
      </div>
    </div>
  );
}

// ─── Text Segment ───────────────────────────────────────────

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-2 text-sm font-bold text-slate-800 first:mt-0">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-2 text-xs font-bold text-slate-700 first:mt-0">{children}</h4>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="mb-0.5 mt-1.5 text-xs font-semibold text-slate-700 first:mt-0">{children}</h5>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-1.5 ml-3 list-disc last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-1.5 ml-3 list-decimal last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-700">{children}</strong>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
      {children}
    </a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-1.5 overflow-x-auto rounded bg-slate-800 p-2 text-[11px] text-slate-100 last:mb-0">
      {children}
    </pre>
  ),
};

export function TextSegmentView({ content, finalized }: { content: string; finalized: boolean }) {
  const videoUrl = finalized ? extractVideoUrl(content) : null;
  const autoAddedRef = useRef(false);

  useEffect(() => {
    if (videoUrl && !autoAddedRef.current) {
      autoAddedRef.current = true;
      requestCanvasAddVideo(videoUrl, "Agent Video");
    }
  }, [videoUrl]);

  return (
    <div>
      {finalized ? (
        <div className="prose-compact text-xs leading-relaxed text-slate-600">
          <Markdown components={markdownComponents}>{content}</Markdown>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
          {content}
          <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-slate-400" />
        </div>
      )}
      {videoUrl && <VideoResultCard url={videoUrl} />}
    </div>
  );
}

// ─── Tool Segment ───────────────────────────────────────────

function AskUserQuestionView({ input }: { input: unknown }) {
  const data = input as {
    questions?: Array<{
      question: string;
      options?: Array<{ label: string; description?: string }>;
    }>;
  };
  const questions = data?.questions;
  if (!Array.isArray(questions)) {
    return <div className="text-xs text-slate-500">Agent is asking a question...</div>;
  }
  return (
    <div className="space-y-1.5">
      {questions.map((q) => (
        <div key={q.question} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5">
          <p className="mb-1 text-xs font-medium text-slate-700">{q.question}</p>
          {q.options && (
            <div className="space-y-0.5">
              {q.options.map((opt) => (
                <div key={opt.label} className="rounded border border-blue-100 bg-white px-1.5 py-0.5">
                  <span className="text-[10px] font-medium text-slate-600">{opt.label}</span>
                  {opt.description && <p className="text-[9px] text-slate-400">{opt.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ToolSegmentView({
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
  if (tool === "AskUserQuestion") {
    return <AskUserQuestionView input={input} />;
  }

  const inputPreview =
    typeof input === "string" ? input.slice(0, 80) : (JSON.stringify(input)?.slice(0, 80) ?? "");
  const videoUrl = extractVideoUrlFromToolOutput(output);

  return (
    <div>
      <div className="flex items-start gap-1.5 py-0.5">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          {completed ? (
            <span className="text-[10px] text-green-500">&#10003;</span>
          ) : (
            <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-medium text-slate-700">{tool}</span>
          {inputPreview && <p className="truncate text-[10px] text-slate-400">{inputPreview}</p>}
        </div>
      </div>
      {videoUrl && <VideoResultCard url={videoUrl} />}
    </div>
  );
}

// ─── Segment List ───────────────────────────────────────────

export function SegmentList({
  segments,
  streaming,
}: {
  segments: TurnSegment[];
  streaming: boolean;
}) {
  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <TextSegmentView key={`text-${i}`} content={seg.content} finalized={seg.finalized} />;
        }
        // Tool is completed if there's a subsequent segment, or turn is not streaming
        const hasNext = i < segments.length - 1;
        const completed = hasNext || !streaming || seg.output !== undefined;
        return (
          <ToolSegmentView
            key={seg.toolId}
            tool={seg.tool}
            input={seg.input}
            output={seg.output}
            completed={completed}
          />
        );
      })}
    </div>
  );
}

// ─── Result Footer ──────────────────────────────────────────

export function TurnResultFooter({
  result,
}: {
  result: { cost: number; inputTokens: number; outputTokens: number };
}) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
      <span>${result.cost.toFixed(4)}</span>
      <span>{result.inputTokens.toLocaleString()} in</span>
      <span>{result.outputTokens.toLocaleString()} out</span>
    </div>
  );
}

// ─── Full Turn View (for sidebar) ───────────────────────────

export function TurnView({ turn }: { turn: AgentTurn }) {
  if (turn.role === "user") {
    return (
      <div className="mx-3 flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-blue-500 px-3 py-2 text-xs text-white">
          <div className="whitespace-pre-wrap break-words leading-relaxed">{turn.userContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
        {turn.streaming && <Loader2 className="h-3 w-3 animate-spin" />}
        Agent
      </div>
      <SegmentList segments={turn.segments} streaming={turn.streaming} />
      {turn.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600">
          {turn.error}
        </div>
      )}
      {turn.result && <TurnResultFooter result={turn.result} />}
    </div>
  );
}
