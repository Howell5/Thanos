import { AIPanel } from "@/components/canvas/ai-panel";
import { Button } from "@/components/ui/button";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { ROUTES } from "@/lib/routes";
import {
  AssetRecordType,
  type Editor,
  type TLAssetId,
  type TLShapeId,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";
import { ArrowLeft, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, error } = useProject(id || "");
  const updateProject = useUpdateProject(id || "");
  const editorRef = useRef<Editor | null>(null);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Handle editor mount
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Load existing canvas data if available
      if (
        project?.canvasData &&
        typeof project.canvasData === "object" &&
        Object.keys(project.canvasData).length > 0
      ) {
        try {
          // canvasData is stored as { document: {...} } format
          loadSnapshot(editor.store, project.canvasData as Parameters<typeof loadSnapshot>[1]);
        } catch (e) {
          console.error("Failed to load canvas data:", e);
        }
      }

      // Track changes
      const unsubscribe = editor.store.listen(() => {
        setHasUnsavedChanges(true);
      });

      return () => {
        unsubscribe();
      };
    },
    [project?.canvasData],
  );

  // Save canvas data
  const handleSave = useCallback(async () => {
    if (!editorRef.current || !id) return;

    try {
      // Get snapshot using tldraw's getSnapshot function
      const { document } = getSnapshot(editorRef.current.store);
      await updateProject.mutateAsync({
        canvasData: { document },
      });
      setHasUnsavedChanges(false);
      toast.success("Canvas saved successfully");
    } catch {
      // Error handled by mutation
    }
  }, [id, updateProject]);

  // Auto-save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle AI image generation callback - add image to canvas
  const handleImageGenerated = useCallback(async (imageUrl: string, imageId: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      // Create asset from URL
      const assetId: TLAssetId = AssetRecordType.createId(imageId);

      // Fetch image to get dimensions
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imageUrl;
      });

      // Create the asset
      editor.createAssets([
        {
          id: assetId,
          type: "image",
          typeName: "asset",
          props: {
            name: `AI Generated ${imageId}`,
            src: imageUrl,
            w: img.naturalWidth,
            h: img.naturalHeight,
            mimeType: "image/png",
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      // Create shape at center of viewport
      const { x, y } = editor.getViewportScreenCenter();
      const point = editor.screenToPage({ x, y });
      const shapeId: TLShapeId = createShapeId();

      // Scale down if image is too large
      const maxSize = 500;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxSize || h > maxSize) {
        const scale = maxSize / Math.max(w, h);
        w *= scale;
        h *= scale;
      }

      editor.createShape({
        id: shapeId,
        type: "image",
        x: point.x - w / 2,
        y: point.y - h / 2,
        props: {
          assetId,
          w,
          h,
        },
      });

      // Select the new shape
      editor.select(shapeId);

      toast.success("Image added to canvas");
    } catch (e) {
      console.error("Failed to add image to canvas:", e);
      toast.error("Failed to add image to canvas");
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">Failed to load project</p>
        <Button asChild variant="outline">
          <Link to={ROUTES.PROJECTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Top Bar */}
      <div className="absolute left-4 top-4 z-50 flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={ROUTES.PROJECTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium backdrop-blur">
          {project.name}
        </div>
        <Button
          variant={hasUnsavedChanges ? "default" : "outline"}
          size="sm"
          onClick={handleSave}
          disabled={updateProject.isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {updateProject.isPending ? "Saving..." : hasUnsavedChanges ? "Save*" : "Save"}
        </Button>
      </div>

      {/* AI Panel */}
      <AIPanel
        projectId={project.id}
        onImageGenerated={handleImageGenerated}
        isOpen={isAIPanelOpen}
        onToggle={() => setIsAIPanelOpen(!isAIPanelOpen)}
      />

      {/* Tldraw Canvas */}
      <Tldraw onMount={handleMount} />
    </div>
  );
}
