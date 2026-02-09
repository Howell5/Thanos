import { AGENT_TURN_SHAPE_TYPE } from "@/components/canvas/agent-turn-shape";
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
 * Sync agent turns from the store onto the tldraw canvas as shapes.
 *
 * - Creates one shape per AgentTurn
 * - Updates existing shapes when content changes (streaming)
 * - Throttles updates during streaming to ~10fps
 * - Rebuilds mapping table from existing shapes on mount (page reload)
 */
export function useAgentCanvasSync(editor: Editor | null) {
  const turnMapRef = useRef<Map<string, TLShapeId>>(new Map());
  const lastUpdateRef = useRef(0);
  const rafRef = useRef<number>(0);
  const initRef = useRef(false);

  // Rebuild mapping from existing shapes on mount
  useEffect(() => {
    if (!editor || initRef.current) return;
    initRef.current = true;

    const existingShapes = editor.getCurrentPageShapes();
    for (const shape of existingShapes) {
      if (shape.type === AGENT_TURN_SHAPE_TYPE) {
        const turnId = (shape.props as { turnId?: string }).turnId;
        if (turnId) {
          turnMapRef.current.set(turnId, shape.id);
        }
      }
    }
  }, [editor]);

  // Subscribe to store changes and sync shapes
  useEffect(() => {
    if (!editor) return;

    const syncToCanvas = () => {
      const { messages, status } = useAgentStore.getState();
      const turns = coalesceMessages(messages, status);
      const turnMap = turnMapRef.current;
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
          // Update existing shape
          const existing = editor.getShape(existingId);
          if (!existing) {
            // Shape was deleted from canvas — remove from map
            turnMap.delete(turn.turnId);
            continue;
          }
          editor.updateShape({
            id: existingId,
            type: AGENT_TURN_SHAPE_TYPE,
            props,
          });
        } else {
          // Create new shape — find position below last turn shape
          const prevTurnIds = [...turnMap.values()];
          const position = findNonOverlappingPosition(
            editor,
            prevTurnIds,
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
            props: {
              ...props,
              h: SHAPE_DEFAULT_HEIGHT,
            },
          });
          turnMap.set(turn.turnId, shapeId);
        }
      }
    };

    // Subscribe to store changes
    const unsubscribe = useAgentStore.subscribe(syncToCanvas);

    // Initial sync
    syncToCanvas();

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor]);

  // Reset mapping when agent session resets
  useEffect(() => {
    const unsubscribe = useAgentStore.subscribe(
      (state, prevState) => {
        // Detect reset: messages went from non-empty to empty (or single user message from fresh send)
        if (prevState.messages.length > 0 && state.messages.length <= 1 && state.status === "running") {
          turnMapRef.current.clear();
        }
      },
    );
    return unsubscribe;
  }, []);
}
