import { AGENT_TURN_SHAPE_TYPE } from "@/components/canvas/agent-turn-shape";
import { coalesceMessages } from "@/lib/agent-turns";
import { useAgentStore } from "@/stores/use-agent-store";
import { useEffect, useRef } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { createShapeId } from "tldraw";

const SHAPE_WIDTH = 380;
const SHAPE_DEFAULT_HEIGHT = 60;
const VERTICAL_GAP = 16;
const THROTTLE_MS = 100;

/**
 * Rebuild turnId → shapeId mapping from shapes already on the canvas.
 */
function rebuildMapFromCanvas(editor: Editor, turnMap: Map<string, TLShapeId>) {
  turnMap.clear();
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === AGENT_TURN_SHAPE_TYPE) {
      const turnId = (shape.props as { turnId?: string }).turnId;
      if (turnId) {
        turnMap.set(turnId, shape.id);
      }
    }
  }
}

/**
 * Get the position for the next turn shape in a vertical timeline.
 * Places directly below the last existing turn shape, or at viewport center if none.
 */
function getNextTimelinePosition(
  editor: Editor,
  turnMap: Map<string, TLShapeId>,
): { x: number; y: number } {
  // Find the bottom-most existing turn shape
  let maxBottom = -Infinity;
  let anchorX = 0;
  let hasAnchor = false;

  for (const shapeId of turnMap.values()) {
    const bounds = editor.getShapePageBounds(shapeId);
    if (!bounds) continue;
    const bottom = bounds.y + bounds.h;
    if (bottom > maxBottom) {
      maxBottom = bottom;
      anchorX = bounds.x;
      hasAnchor = true;
    }
  }

  if (hasAnchor) {
    return { x: anchorX, y: maxBottom + VERTICAL_GAP };
  }

  // No existing turns — start at viewport center
  const vp = editor.getViewportPageBounds();
  return {
    x: vp.x + vp.w / 2 - SHAPE_WIDTH / 2,
    y: vp.y + vp.h / 3,
  };
}

/**
 * Sync assistant turns from the Zustand store onto the tldraw canvas.
 * User turns are only shown in the sidebar, not on canvas.
 * Assistant turns are stacked vertically in a timeline layout.
 */
export function useAgentCanvasSync(editor: Editor | null) {
  const turnMapRef = useRef<Map<string, TLShapeId>>(new Map());
  const lastUpdateRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!editor) return;

    const turnMap = turnMapRef.current;
    rebuildMapFromCanvas(editor, turnMap);

    const syncToCanvas = () => {
      const { messages, status } = useAgentStore.getState();
      if (messages.length === 0) return;

      const turns = coalesceMessages(messages, status);
      const isStreaming = status === "running";

      // Throttle during streaming
      if (isStreaming) {
        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(syncToCanvas);
          return;
        }
        lastUpdateRef.current = now;
      }

      for (const turn of turns) {
        // Skip user turns — only show on sidebar
        if (turn.role === "user") continue;

        const existingId = turnMap.get(turn.turnId);

        const props = {
          w: SHAPE_WIDTH,
          segments: JSON.stringify(turn.segments),
          role: turn.role,
          userContent: turn.userContent ?? "",
          streaming: turn.streaming,
          resultJson: turn.result ? JSON.stringify(turn.result) : "",
          error: turn.error ?? "",
          turnId: turn.turnId,
        };

        if (existingId) {
          if (!editor.getShape(existingId)) {
            turnMap.delete(turn.turnId);
            continue;
          }
          editor.updateShape({ id: existingId, type: AGENT_TURN_SHAPE_TYPE, props });
        } else {
          const position = getNextTimelinePosition(editor, turnMap);
          const shapeId = createShapeId();
          editor.createShape({
            id: shapeId,
            type: AGENT_TURN_SHAPE_TYPE,
            x: position.x,
            y: position.y,
            props: { ...props, h: SHAPE_DEFAULT_HEIGHT },
          });
          turnMap.set(turn.turnId, shapeId);
        }
      }
    };

    const unsubscribe = useAgentStore.subscribe((state, prevState) => {
      if (state.messages === prevState.messages && state.status === prevState.status) return;

      if (prevState.messages.length > 0 && state.messages.length <= 1 && state.status === "running") {
        rebuildMapFromCanvas(editor, turnMap);
      }

      syncToCanvas();
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor]);
}
