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

  // Save canvas data (document + session)
  const handleSave = useCallback(
    async (data: { document: unknown; session: unknown }) => {
      await updateProject.mutateAsync({
        canvasData: data,
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
