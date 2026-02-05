import type { Editor, TLShapeId } from "tldraw";
import { createShapeId } from "tldraw";
import type { AgentEvent } from "@/lib/agent-sse";
import {
  AGENT_EVENT_SHAPE_TYPE,
  type AgentEventVariant,
} from "./agent-event-shape";

/**
 * Layout configuration for agent event visualization
 */
const LAYOUT = {
  gapY: 12,
  shapeWidth: 360,
  shapeHeight: 64,
  doneHeight: 48,
};

/**
 * AgentRenderer - Maps agent SSE events to custom tldraw shapes
 *
 * Creates visually styled agent-event shapes on the canvas.
 */
export class AgentRenderer {
  private editor: Editor;
  private startX: number = 100;
  private currentY: number = 100;
  private toolShapeMap: Map<string, TLShapeId> = new Map();
  private sessionShapeIds: TLShapeId[] = [];
  private thinkingShapeId: TLShapeId | null = null;
  private thinkingContent: string = "";

  constructor(editor: Editor) {
    this.editor = editor;
    this.initializePosition();
  }

  private initializePosition(): void {
    const viewportBounds = this.editor.getViewportPageBounds();
    this.startX = viewportBounds.x + 50;
    this.currentY = viewportBounds.y + 50;
  }

  reset(): void {
    if (this.sessionShapeIds.length > 0) {
      this.editor.deleteShapes(this.sessionShapeIds);
    }
    this.initializePosition();
    this.toolShapeMap.clear();
    this.sessionShapeIds = [];
    this.thinkingShapeId = null;
    this.thinkingContent = "";
  }

  renderEvent(event: AgentEvent): void {
    switch (event.type) {
      case "system":
        this.renderSystemEvent(event);
        break;
      case "thinking":
        this.renderThinkingEvent(event);
        break;
      case "tool_start":
        this.renderToolStartEvent(event);
        break;
      case "tool_end":
        this.renderToolEndEvent(event);
        break;
      case "message":
        this.renderMessageEvent(event);
        break;
      case "done":
        this.renderDoneEvent(event);
        break;
      case "error":
        this.renderErrorEvent(event);
        break;
    }
  }

  private createAgentShape(
    variant: AgentEventVariant,
    label: string,
    detail: string = "",
    height: number = LAYOUT.shapeHeight,
  ): TLShapeId {
    const shapeId = createShapeId();
    this.editor.createShape({
      id: shapeId,
      type: AGENT_EVENT_SHAPE_TYPE,
      x: this.startX,
      y: this.currentY,
      props: {
        w: LAYOUT.shapeWidth,
        h: height,
        variant,
        label: this.truncate(label, 120),
        detail: this.truncate(detail, 200),
      },
    });
    this.sessionShapeIds.push(shapeId);
    this.currentY += height + LAYOUT.gapY;
    return shapeId;
  }

  private renderSystemEvent(event: Extract<AgentEvent, { type: "system" }>): void {
    this.createAgentShape(
      "system",
      "Session Started",
      `ID: ${event.sessionId.slice(0, 12)}...`,
      LAYOUT.doneHeight,
    );
  }

  private renderThinkingEvent(event: Extract<AgentEvent, { type: "thinking" }>): void {
    this.thinkingContent += event.content;

    if (!this.thinkingShapeId) {
      const shapeId = createShapeId();
      this.editor.createShape({
        id: shapeId,
        type: AGENT_EVENT_SHAPE_TYPE,
        x: this.startX,
        y: this.currentY,
        props: {
          w: LAYOUT.shapeWidth,
          h: LAYOUT.shapeHeight,
          variant: "thinking",
          label: "Thinking...",
          detail: this.truncate(this.thinkingContent, 200),
        },
      });
      this.sessionShapeIds.push(shapeId);
      this.thinkingShapeId = shapeId;
    } else {
      this.editor.updateShape({
        id: this.thinkingShapeId,
        type: AGENT_EVENT_SHAPE_TYPE,
        props: {
          detail: this.truncate(this.thinkingContent, 200),
        },
      });
    }
  }

  private finalizeThinking(): void {
    if (this.thinkingShapeId) {
      this.currentY += LAYOUT.shapeHeight + LAYOUT.gapY;
      this.thinkingShapeId = null;
      this.thinkingContent = "";
    }
  }

  private renderToolStartEvent(event: Extract<AgentEvent, { type: "tool_start" }>): void {
    this.finalizeThinking();

    const shapeId = createShapeId();
    const inputStr = this.formatInput(event.input);

    this.editor.createShape({
      id: shapeId,
      type: AGENT_EVENT_SHAPE_TYPE,
      x: this.startX,
      y: this.currentY,
      props: {
        w: LAYOUT.shapeWidth,
        h: LAYOUT.shapeHeight,
        variant: "tool",
        label: event.tool,
        detail: this.truncate(inputStr, 200),
      },
    });

    this.sessionShapeIds.push(shapeId);
    this.toolShapeMap.set(event.tool, shapeId);
    this.currentY += LAYOUT.shapeHeight + LAYOUT.gapY;
  }

  private renderToolEndEvent(event: Extract<AgentEvent, { type: "tool_end" }>): void {
    const existingShapeId = this.toolShapeMap.get(event.tool);

    if (existingShapeId) {
      const existingShape = this.editor.getShape(existingShapeId);
      if (existingShape && existingShape.type === AGENT_EVENT_SHAPE_TYPE) {
        const currentLabel = (existingShape.props as { label?: string }).label || event.tool;
        this.editor.updateShape({
          id: existingShapeId,
          type: AGENT_EVENT_SHAPE_TYPE,
          props: {
            variant: "tool_done",
            label: currentLabel,
            detail: this.truncate(event.output, 200),
          },
        });
      }
      this.toolShapeMap.delete(event.tool);
    } else {
      this.createAgentShape(
        "tool_done",
        event.tool,
        this.truncate(event.output, 200),
      );
    }
  }

  private renderMessageEvent(event: Extract<AgentEvent, { type: "message" }>): void {
    this.finalizeThinking();
    this.createAgentShape("message", "Assistant", event.content);
  }

  private renderDoneEvent(event: Extract<AgentEvent, { type: "done" }>): void {
    this.finalizeThinking();
    this.createAgentShape(
      "done",
      "Completed",
      `$${event.cost.toFixed(4)} · ${event.inputTokens} in / ${event.outputTokens} out`,
      LAYOUT.doneHeight,
    );
  }

  private renderErrorEvent(event: Extract<AgentEvent, { type: "error" }>): void {
    this.finalizeThinking();
    this.createAgentShape("error", "Error", event.message);
  }

  private formatInput(input: unknown): string {
    if (typeof input === "string") return input;
    try {
      return JSON.stringify(input);
    } catch {
      return "[Unable to display]";
    }
  }

  private truncate(text: string, maxLength: number = 200): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  }
}
