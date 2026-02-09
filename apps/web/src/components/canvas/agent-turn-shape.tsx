import type { TurnSegment } from "@/lib/agent-turns";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type RecordProps,
  T,
  type TLShape,
  useEditor,
} from "tldraw";
import { useCallback, useEffect, useRef } from "react";
import { SegmentList, TurnResultFooter } from "./agent-turn-segments";
import { Loader2 } from "lucide-react";

// ─── Shape Type ─────────────────────────────────────────────

export const AGENT_TURN_SHAPE_TYPE = "agent-turn" as const;

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [AGENT_TURN_SHAPE_TYPE]: {
      w: number;
      h: number;
      segments: string;
      role: string;
      userContent: string;
      streaming: boolean;
      resultJson: string;
      error: string;
      turnId: string;
    };
  }
}

type IAgentTurnShape = TLShape<typeof AGENT_TURN_SHAPE_TYPE>;

// ─── User Turn Component ────────────────────────────────────

function UserTurnComponent({ shape }: { shape: IAgentTurnShape }) {
  const { w, userContent } = shape.props;
  const editor = useEditor();
  const contentRef = useRef<HTMLDivElement>(null);

  const syncHeight = useCallback(() => {
    if (!contentRef.current) return;
    const measured = contentRef.current.scrollHeight + 2;
    if (Math.abs(measured - shape.props.h) > 5) {
      editor.updateShape({ id: shape.id, type: AGENT_TURN_SHAPE_TYPE, props: { h: measured } });
    }
  }, [editor, shape.id, shape.props.h]);

  useEffect(() => {
    syncHeight();
  }, [syncHeight, userContent]);

  return (
    <HTMLContainer>
      <div
        ref={contentRef}
        style={{
          width: w,
          display: "flex",
          justifyContent: "flex-end",
          padding: 4,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "85%",
            borderRadius: 10,
            backgroundColor: "#3b82f6",
            padding: "8px 12px",
            fontSize: 12,
            color: "#fff",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {userContent}
        </div>
      </div>
    </HTMLContainer>
  );
}

// ─── Assistant Turn Component ───────────────────────────────

function AssistantTurnComponent({ shape }: { shape: IAgentTurnShape }) {
  const { w, segments: segmentsJson, streaming, resultJson, error } = shape.props;
  const editor = useEditor();
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  let segments: TurnSegment[] = [];
  try {
    segments = JSON.parse(segmentsJson);
  } catch {
    segments = [];
  }

  let result: { cost: number; inputTokens: number; outputTokens: number } | undefined;
  if (resultJson) {
    try {
      result = JSON.parse(resultJson);
    } catch {
      // ignore
    }
  }

  const syncHeight = useCallback(() => {
    if (!contentRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!contentRef.current) return;
      const measured = contentRef.current.scrollHeight + 2;
      if (Math.abs(measured - shape.props.h) > 8) {
        editor.updateShape({ id: shape.id, type: AGENT_TURN_SHAPE_TYPE, props: { h: measured } });
      }
    });
  }, [editor, shape.id, shape.props.h]);

  // Sync height on content changes
  useEffect(() => {
    syncHeight();
  }, [syncHeight, segmentsJson, resultJson, error]);

  // ResizeObserver for dynamic content
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [syncHeight]);

  return (
    <HTMLContainer>
      <div
        ref={contentRef}
        className="agent-turn-card"
        style={{
          width: w,
          borderRadius: 10,
          border: "1.5px solid #e2e8f0",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderBottom: "1px solid #f1f5f9",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#d97706",
          }}
        >
          {streaming && <Loader2 className="h-3 w-3 animate-spin" />}
          Agent
        </div>

        {/* Segments */}
        <div style={{ padding: "8px 10px" }}>
          <SegmentList segments={segments} streaming={streaming} />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              margin: "0 10px 8px",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #fecaca",
              backgroundColor: "#fef2f2",
              fontSize: 11,
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}

        {/* Result footer */}
        {result && (
          <div style={{ padding: "0 10px 8px" }}>
            <TurnResultFooter result={result} />
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}

// ─── Shape Component ────────────────────────────────────────

function AgentTurnComponent({ shape }: { shape: IAgentTurnShape }) {
  if (shape.props.role === "user") {
    return <UserTurnComponent shape={shape} />;
  }
  return <AssistantTurnComponent shape={shape} />;
}

// ─── Shape Util ─────────────────────────────────────────────

export class AgentTurnShapeUtil extends BaseBoxShapeUtil<IAgentTurnShape> {
  static override type = AGENT_TURN_SHAPE_TYPE;
  static override props: RecordProps<IAgentTurnShape> = {
    w: T.number,
    h: T.number,
    segments: T.string,
    role: T.string,
    userContent: T.string,
    streaming: T.boolean,
    resultJson: T.string,
    error: T.string,
    turnId: T.string,
  };

  getDefaultProps(): IAgentTurnShape["props"] {
    return {
      w: 380,
      h: 60,
      segments: "[]",
      role: "assistant",
      userContent: "",
      streaming: false,
      resultJson: "",
      error: "",
      turnId: "",
    };
  }

  override canEdit() {
    return false;
  }
  override canResize() {
    return true;
  }
  override canBind() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }

  component(shape: IAgentTurnShape) {
    return <AgentTurnComponent shape={shape} />;
  }

  indicator(shape: IAgentTurnShape) {
    return <rect rx={10} ry={10} width={shape.props.w} height={shape.props.h} />;
  }
}
