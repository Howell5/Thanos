import {
  DefaultToolbar,
  type Editor,
  type TLUiComponents,
  Tldraw,
  getSnapshot,
  loadSnapshot,
  useEditor,
} from "tldraw";
import "tldraw/tldraw.css";
import { Button } from "@/components/ui/button";
import { useAgentRenderer } from "@/hooks/use-agent-renderer";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { onCanvasSaveRequest, requestCanvasSave } from "@/lib/canvas-events";
import {
  DEFAULT_MAX_IMAGE_SIZE,
  type ImageMeta,
  createImageAssetStoreWithUpload,
  getVideoDimensions,
  isVideoFile,
} from "@/lib/image-assets";
import { ROUTES } from "@/lib/routes";
import { useAgentStore } from "@/stores/use-agent-store";
import { selectUploadingCount, useAIStore } from "@/stores/use-ai-store";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AgentChatPanel, AgentPanelToggle } from "./agent-chat-panel";
import { BottomPromptPanel } from "./bottom-prompt-panel";
import { RichCardShapeUtil } from "./rich-card-shape";
import { VIDEO_SHAPE_TYPE, VideoShapeUtil } from "./video-shape";

const AUTO_SAVE_DELAY = 2000;
import { FloatingToolbar } from "./floating-toolbar";
import { GeneratingOverlay } from "./generating-overlay";
import { InpaintingOverlay } from "./inpainting-overlay";
import { UploadingOverlay } from "./uploading-overlay";

interface TldrawCanvasProps {
  projectId: string;
  projectName: string;
  canvasData?: unknown;
  onSave: (data: { document: unknown; session: unknown }) => Promise<void>;
  isSaving: boolean;
}

// Save status for UI feedback
type SaveStatus = "idle" | "saving" | "saved";

// Store for passing props to InFrontOfTheCanvas
let canvasPropsStore: {
  projectName: string;
  onSave: () => void;
  isSaving: boolean;
  saveStatus: SaveStatus;
} | null = null;

// Component to handle keyboard shortcuts and upload cleanup
function CanvasEventHandler() {
  const editor = useEditor();
  const { cancelUpload } = useAIStore();

  // Add keyboard shortcuts
  useKeyboardShortcuts(editor);

  // Connect agent renderer to canvas
  useAgentRenderer(editor);

  // Listen for shape deletions to cancel upload tasks
  useEffect(() => {
    const unsubscribe = editor.store.listen(
      (entry) => {
        // Check for deleted shapes
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === "shape" && "meta" in record) {
            const meta = record.meta as unknown as ImageMeta;
            // If it was an uploading shape, cancel the upload task
            if (meta?.source === "uploading" && meta.uploadTaskId) {
              cancelUpload(meta.uploadTaskId);
            }
          }
        }
      },
      { source: "user", scope: "document" },
    );

    return () => {
      unsubscribe();
    };
  }, [editor, cancelUpload]);

  return null;
}

// Component rendered in front of the canvas (highest z-index)
function InFrontOfTheCanvas() {
  const props = canvasPropsStore;
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const agentStatus = useAgentStore((s) => s.status);

  // Auto-open panel when agent starts running
  useEffect(() => {
    if (agentStatus === "running") {
      setAgentPanelOpen(true);
    }
  }, [agentStatus]);

  return (
    <>
      <FloatingToolbar />
      <BottomPromptPanel />
      {agentPanelOpen ? (
        <AgentChatPanel open={agentPanelOpen} onClose={() => setAgentPanelOpen(false)} />
      ) : (
        <AgentPanelToggle onClick={() => setAgentPanelOpen(true)} />
      )}
      <GeneratingOverlay />
      <InpaintingOverlay />
      <UploadingOverlay />
      {/* Top Bar - positioned at top left */}
      {/* Note: pointer-events-auto is needed because tldraw's InFrontOfTheCanvas has pointer-events: none */}
      <div className="pointer-events-auto fixed left-4 top-4 z-[300] flex items-center gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-gray-200 bg-white shadow-sm hover:bg-gray-50"
        >
          <Link to={ROUTES.PROJECTS}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回
          </Link>
        </Button>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium shadow-sm">
          {props?.projectName}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={props?.onSave}
          disabled={props?.isSaving || props?.saveStatus === "saving"}
          className="border-gray-200 bg-white shadow-sm hover:bg-gray-50"
        >
          {props?.saveStatus === "saving" ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              保存中
            </>
          ) : props?.saveStatus === "saved" ? (
            <>
              <Check className="mr-1.5 h-4 w-4 text-green-600" />
              已保存
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              保存
            </>
          )}
        </Button>
      </div>
    </>
  );
}

function VerticalToolbar() {
  return <DefaultToolbar orientation="vertical" />;
}

const uiComponents: Partial<TLUiComponents> = {
  Toolbar: VerticalToolbar,
  StylePanel: null,
  NavigationPanel: null,
  MainMenu: null,
  PageMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  QuickActions: null,
  DebugMenu: null,
  DebugPanel: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
  Minimap: null,
  ImageToolbar: null,
};

// Check if canvasData has valid snapshot format
function isValidSnapshot(data: unknown): data is { document: unknown } {
  return (
    data !== null &&
    typeof data === "object" &&
    "document" in data &&
    data.document !== null &&
    typeof data.document === "object"
  );
}

// Inner component that has access to the editor
function CanvasInner({
  canvasData,
  onSave,
}: {
  canvasData?: unknown;
  onSave: (data: { document: unknown; session: unknown }) => Promise<void>;
}) {
  const editor = useEditor();
  const hasLoadedRef = useRef(false);

  // Load canvas data on mount
  useEffect(() => {
    if (!hasLoadedRef.current && isValidSnapshot(canvasData)) {
      try {
        loadSnapshot(editor.store, canvasData as Parameters<typeof loadSnapshot>[1]);
        hasLoadedRef.current = true;
      } catch (e) {
        console.error("Failed to load canvas data:", e);
      }
    }
  }, [editor, canvasData]);

  // Expose save function
  useEffect(() => {
    const handleSave = async () => {
      const { document, session } = getSnapshot(editor.store);
      await onSave({ document, session });
    };

    // Listen for Cmd/Ctrl + S
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, onSave]);

  return <CanvasEventHandler />;
}

export function TldrawCanvas({
  projectId,
  projectName,
  canvasData,
  onSave,
  isSaving,
}: TldrawCanvasProps) {
  const { setProjectId: setAIProjectId, uploadImage } = useAIStore();
  const setAgentProjectId = useAgentStore((s) => s.setProjectId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Create asset store with R2 upload support
  // This integrates with tldraw's native drag-and-drop
  const assetStore = useMemo(
    () =>
      createImageAssetStoreWithUpload(async (file) => {
        const result = await uploadImage(file, "");
        // Trigger save after upload completes
        requestCanvasSave();
        return { r2Url: result.r2Url, id: result.id };
      }),
    [uploadImage],
  );
  const editorRef = useRef<Editor | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set project ID for both AI store and Agent store
  useEffect(() => {
    setAIProjectId(projectId);
    setAgentProjectId(projectId);
  }, [projectId, setAIProjectId, setAgentProjectId]);

  // Internal save function (silent, for auto-save)
  const performSave = useCallback(
    async (showToast: boolean) => {
      if (!editorRef.current) return;

      setSaveStatus("saving");
      try {
        const { document, session } = getSnapshot(editorRef.current.store);
        await onSave({ document, session });
        hasUnsavedChangesRef.current = false;
        setSaveStatus("saved");

        // Show toast only for manual save
        if (showToast) {
          toast.success("保存成功");
        }

        // Reset status after 2 seconds
        savedStatusTimerRef.current = setTimeout(() => {
          setSaveStatus("idle");
        }, 2000);
      } catch {
        setSaveStatus("idle");
        // Error toast is handled by the mutation for manual save
      }
    },
    [onSave],
  );

  // Manual save handler (with toast)
  const handleSave = useCallback(() => {
    // Clear any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    performSave(true);
  }, [performSave]);

  // Auto-save function (debounced, silent)
  const scheduleAutoSave = useCallback(() => {
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Schedule new auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      if (hasUnsavedChangesRef.current) {
        performSave(false);
      }
    }, AUTO_SAVE_DELAY);
  }, [performSave]);

  // Track unsaved changes and trigger auto-save
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Track changes and schedule auto-save
      const unsubscribeChanges = editor.store.listen(
        () => {
          hasUnsavedChangesRef.current = true;
          scheduleAutoSave();
        },
        { source: "user", scope: "document" },
      );

      // Auto-resize large images dropped onto canvas
      // This catches tldraw's native drag-and-drop which creates shapes at original size
      const unsubscribeResize = editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
        if (shape.type !== "image") return;

        const imageShape = shape as { props: { w: number; h: number } };
        const { w, h } = imageShape.props;
        const maxEdge = Math.max(w, h);

        // Skip if already within size limit or is a placeholder (generating)
        if (maxEdge <= DEFAULT_MAX_IMAGE_SIZE) return;
        const meta = shape.meta as ImageMeta | undefined;
        if (meta?.source === "generating") return;

        // Calculate scale to fit within max size
        const scale = DEFAULT_MAX_IMAGE_SIZE / maxEdge;
        const newWidth = Math.round(w * scale);
        const newHeight = Math.round(h * scale);

        // Update shape with scaled dimensions
        editor.updateShape({
          id: shape.id,
          type: "image",
          props: {
            w: newWidth,
            h: newHeight,
          },
        });
      });

      return () => {
        unsubscribeChanges();
        unsubscribeResize();
      };
    },
    [scheduleAutoSave],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (savedStatusTimerRef.current) {
        clearTimeout(savedStatusTimerRef.current);
      }
    };
  }, []);

  // Subscribe to external save requests (from upload complete, AI generation, etc.)
  useEffect(() => {
    return onCanvasSaveRequest(() => {
      // Clear any pending auto-save to avoid duplicate saves
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      performSave(false);
    });
  }, [performSave]);

  // Warn if uploads in progress before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check for uploads in progress - warn user
      const uploadingCount = selectUploadingCount(useAIStore.getState());
      if (uploadingCount > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
      // Note: auto-save handles saving changes, no need for sendBeacon
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Intercept video file drops before tldraw handles them
  const handleDropCapture = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer?.files?.length || !editorRef.current) return;
      const videoFiles = Array.from(e.dataTransfer.files).filter(isVideoFile);
      if (videoFiles.length === 0) return;

      e.preventDefault();
      e.stopPropagation();
      const editor = editorRef.current;
      const dropPoint = editor.screenToPage({ x: e.clientX, y: e.clientY });

      for (const file of videoFiles) {
        try {
          const [result, dims] = await Promise.all([
            uploadImage(file, ""),
            getVideoDimensions(file),
          ]);
          const maxEdge = Math.max(dims.width, dims.height);
          const scale = maxEdge > DEFAULT_MAX_IMAGE_SIZE ? DEFAULT_MAX_IMAGE_SIZE / maxEdge : 1;
          const w = Math.round(dims.width * scale);
          const h = Math.round(dims.height * scale);

          editor.createShape({
            type: VIDEO_SHAPE_TYPE,
            x: dropPoint.x - w / 2,
            y: dropPoint.y - h / 2,
            props: { w, h, videoUrl: result.r2Url, fileName: file.name },
            meta: {
              source: "uploaded",
              videoId: result.videoId,
              duration: result.duration,
              originalWidth: dims.width,
              originalHeight: dims.height,
            } as ImageMeta,
          });
          requestCanvasSave();
        } catch (error) {
          console.error("Failed to upload video:", error);
          toast.error("视频上传失败");
        }
      }
    },
    [uploadImage],
  );

  // Update props store for InFrontOfTheCanvas
  canvasPropsStore = {
    projectName,
    onSave: handleSave,
    isSaving,
    saveStatus,
  };

  return (
    <div className="relative h-full w-full" onDropCapture={handleDropCapture}>
      <Tldraw
        shapeUtils={[RichCardShapeUtil, VideoShapeUtil]}
        assets={assetStore}
        components={{
          InFrontOfTheCanvas: InFrontOfTheCanvas,
          ...uiComponents,
        }}
        onMount={handleMount}
      >
        <CanvasInner canvasData={canvasData} onSave={onSave} />
      </Tldraw>
    </div>
  );
}
