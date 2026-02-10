import { AgentChatPanel, AgentPanelToggle } from "@/components/canvas/agent-chat-panel";
import { TldrawCanvas } from "@/components/canvas/tldraw-canvas";
import { Button } from "@/components/ui/button";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { ROUTES } from "@/lib/routes";
import { useAgentStore } from "@/stores/use-agent-store";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, error } = useProject(id || "");
  const updateProject = useUpdateProject(id || "");
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const agentStatus = useAgentStore((s) => s.status);

  // Auto-open panel when agent starts running
  useEffect(() => {
    if (agentStatus === "running") {
      setAgentPanelOpen(true);
    }
  }, [agentStatus]);

  // Restore chat messages from DB when project loads
  useEffect(() => {
    if (!project?.chatMessages || !project.id) return;
    const data = project.chatMessages as {
      sessionId: string | null;
      messages: Array<unknown>;
      status: string;
    };
    if (!data.messages?.length) return;
    useAgentStore.getState().restoreSession(project.id, {
      sessionId: data.sessionId,
      messages: data.messages as import("@/stores/use-agent-store").ChatMessage[],
      status: data.status as import("@/stores/use-agent-store").AgentStatus,
    });
  }, [project?.chatMessages, project?.id]);

  // Save canvas data (document + session) along with chat messages
  const handleSave = useCallback(
    async (data: { document: unknown; session: unknown }) => {
      const agentState = useAgentStore.getState();
      const chatMessages =
        agentState.messages.length > 0
          ? {
              sessionId: agentState.sessionId,
              messages: agentState.messages,
              status: agentState.status === "running" ? "idle" : agentState.status,
            }
          : undefined;

      await updateProject.mutateAsync({
        canvasData: data,
        chatMessages,
      });
    },
    [updateProject],
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">加载项目中...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">加载项目失败</p>
        <Button asChild variant="outline">
          <Link to={ROUTES.PROJECTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回项目列表
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <TldrawCanvas
        projectId={project.id}
        projectName={project.name}
        canvasData={project.canvasData}
        onSave={handleSave}
        isSaving={updateProject.isPending}
      />
      {agentPanelOpen ? (
        <AgentChatPanel open={agentPanelOpen} onClose={() => setAgentPanelOpen(false)} />
      ) : (
        <AgentPanelToggle onClick={() => setAgentPanelOpen(true)} />
      )}
    </div>
  );
}
