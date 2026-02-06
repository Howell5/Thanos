import { AgentRenderer } from "@/components/canvas/agent-renderer";
import { useAgentStore } from "@/stores/use-agent-store";
import { useEffect, useRef } from "react";
import type { Editor } from "tldraw";

/**
 * Hook to manage an AgentRenderer instance.
 *
 * No longer auto-renders process shapes or artifacts.
 * The renderer is available for AgentChatPanel to call
 * renderArtifact() on demand (via "Add to Canvas" button).
 */
export function useAgentRenderer(editor: Editor | null) {
  const rendererRef = useRef<AgentRenderer | null>(null);
  const status = useAgentStore((s) => s.status);

  // Initialize renderer when editor is ready
  useEffect(() => {
    if (editor && !rendererRef.current) {
      rendererRef.current = new AgentRenderer(editor);
    }
  }, [editor]);

  // Reset renderer tracking when a new session starts
  useEffect(() => {
    if (status === "running" && rendererRef.current) {
      rendererRef.current.reset();
    }
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      rendererRef.current = null;
    };
  }, []);

  return rendererRef.current;
}
