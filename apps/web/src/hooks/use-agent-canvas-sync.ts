import { AGENT_TURN_SHAPE_TYPE } from "@/components/canvas/agent-turn-shape";
import type { AgentTurn } from "@/lib/agent-turns";
import { coalesceMessages } from "@/lib/agent-turns";
import { findNonOverlappingPosition } from "@/lib/canvas-position";
import { useAgentStore } from "@/stores/use-agent-store";
import { useEffect, useRef } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { createShapeId } from "tldraw";

const SHAPE_WIDTH = 380;
const SHAPE_DEFAULT_HEIGHT = 60;
const THROTTLE_MS = 100;

/**
 * Rebuild turnId → shapeId mapping from shapes already on the canvas.
 * Called once on init and after reset to stay in sync with persisted canvas.
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
 * Sync agent turns from the Zustand store onto the tldraw canvas as shapes.
 *
 * Key invariant: a turn shape is only created if its turnId is NOT already
 * in the mapping. The mapping is rebuilt from canvas shapes on init, so
 * rehydrated history (already persisted in canvas snapshot) is never duplicated.
 */
export function useAgentCanvasSync(editor: Editor | null) {
  const turnMapRef = useRef<Map<string, TLShapeId>>(new Map());
  const lastUpdateRef = useRef(0);
  const rafRef = useRef<number>(0);
  const prevTurnsRef = useRef<AgentTurn[]>([]);

  useEffect(() => {
    if (!editor) return;

    const turnMap = turnMapRef.current;

    // Rebuild from canvas once on mount
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
          // Update existing shape (skip if user deleted it from canvas)
          if (!editor.getShape(existingId)) {
            turnMap.delete(turn.turnId);
            continue;
          }
          editor.updateShape({ id: existingId, type: AGENT_TURN_SHAPE_TYPE, props });
        } else {
          // New turn — create shape
          const prevShapeIds = [...turnMap.values()];
          const position = findNonOverlappingPosition(
            editor,
            prevShapeIds,
            SHAPE_WIDTH,
            SHAPE_DEFAULT_HEIGHT,
            { gap: 16 },
          );

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

      prevTurnsRef.current = turns;
    };

    const unsubscribe = useAgentStore.subscribe((state, prevState) => {
      // Only sync when messages or status actually changed
      if (state.messages === prevState.messages && state.status === prevState.status) return;

      // Detect session reset → rebuild map from (now-empty) canvas
      if (prevState.messages.length > 0 && state.messages.length <= 1 && state.status === "running") {
        rebuildMapFromCanvas(editor, turnMap);
      }

      syncToCanvas();
    });

    // Do NOT call syncToCanvas() here on mount.
    // Rehydrated messages already have their shapes persisted in the canvas snapshot.
    // Shapes will be synced naturally when the next store change fires.

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor]);
}
