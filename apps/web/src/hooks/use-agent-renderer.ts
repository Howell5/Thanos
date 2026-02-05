import { AgentRenderer } from "@/components/canvas/agent-renderer";
import { useAgentStore } from "@/stores/use-agent-store";
import type { Editor } from "tldraw";
import { useEffect, useRef } from "react";

/**
 * Hook to connect AgentRenderer with Agent Store
 *
 * Creates an AgentRenderer instance and subscribes to agent events,
 * rendering each event on the canvas as it arrives.
 */
export function useAgentRenderer(editor: Editor | null) {
  const rendererRef = useRef<AgentRenderer | null>(null);
  const lastEventCountRef = useRef(0);

  // Get events from store
  const events = useAgentStore((s) => s.events);
  const status = useAgentStore((s) => s.status);

  // Initialize renderer when editor is ready
  useEffect(() => {
    if (editor && !rendererRef.current) {
      rendererRef.current = new AgentRenderer(editor);
    }
  }, [editor]);

  // Reset renderer when agent is reset or starts new session
  useEffect(() => {
    if (status === "running" && events.length === 0 && rendererRef.current) {
      // New session starting, reset the renderer
      rendererRef.current.reset();
      lastEventCountRef.current = 0;
    }
  }, [status, events.length]);

  // Render new events as they arrive
  useEffect(() => {
    if (!rendererRef.current) return;

    // Process only new events (ones we haven't seen yet)
    const newEvents = events.slice(lastEventCountRef.current);

    for (const event of newEvents) {
      rendererRef.current.renderEvent(event);
    }

    lastEventCountRef.current = events.length;
  }, [events]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      rendererRef.current = null;
      lastEventCountRef.current = 0;
    };
  }, []);

  return rendererRef.current;
}
