import { TldrawCanvas } from "@/components/canvas/tldraw-canvas";
import { Button } from "@/components/ui/button";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { ROUTES } from "@/lib/routes";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, error } = useProject(id || "");
  const updateProject = useUpdateProject(id || "");

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
    <TldrawCanvas
      projectId={project.id}
      projectName={project.name}
      canvasData={project.canvasData}
      onSave={handleSave}
      isSaving={updateProject.isPending}
    />
  );
}
