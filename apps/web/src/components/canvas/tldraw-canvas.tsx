import {
  DefaultToolbar,
  type Editor,
  type TLUiComponents,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  useEditor,
} from "tldraw";
import "tldraw/tldraw.css";
import { useAgentRenderer } from "@/hooks/use-agent-renderer";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  type AddVideoPayload,
  onCanvasAddShapeRequest,
  onCanvasAddVideoRequest,
  onCanvasClearHighlight,
  onCanvasHighlightShape,
  onCanvasSaveRequest,
  requestCanvasSave,
} from "@/lib/canvas-events";
import { handleAddShape } from "@/lib/canvas-shape-builder";
import { deriveShapeSummaries } from "@/lib/shape-summary";
import { useCanvasShapeStore } from "@/stores/use-canvas-shape-store";
import {
  DEFAULT_MAX_IMAGE_SIZE,
  type ImageMeta,
  createImageAssetStoreWithUpload,
  getVideoDimensions,
  isVideoFile,
} from "@/lib/image-assets";
import { useAgentStore } from "@/stores/use-agent-store";
import { selectUploadingCount, useAIStore } from "@/stores/use-ai-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentTurnShapeUtil } from "./agent-turn-shape";
import { type SaveStatus, InFrontOfTheCanvas, setCanvasPropsStore } from "./canvas-overlay";
import { RichCardShapeUtil } from "./rich-card-shape";
import { VIDEO_SHAPE_TYPE, VideoShapeUtil } from "./video-shape";

const AUTO_SAVE_DELAY = 2000;

interface TldrawCanvasProps {
  projectId: string;
  projectName: string;
  canvasData?: unknown;
  onSave: (data: { document: unknown; session: unknown }) => Promise<void>;
  isSaving: boolean;
}

// Component to handle keyboard shortcuts and upload cleanup
function CanvasEventHandler() {
  const editor = useEditor();
  const { cancelUpload } = useAIStore();

  // Add keyboard shortcuts
  useKeyboardShortcuts(editor);

  // Connect agent renderer to canvas (for artifact placement)
  useAgentRenderer(editor);

  useEffect(() => {
    return editor.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === "shape" && "meta" in record) {
            const meta = record.meta as unknown as ImageMeta;
            if (meta?.source === "uploading" && meta.uploadTaskId) {
              cancelUpload(meta.uploadTaskId);
            }
          }
        }
      },
      { source: "user", scope: "document" },
    );
  }, [editor, cancelUpload]);

  // Listen for video add requests from outside tldraw (e.g. AgentChatPanel)
  useEffect(() => {
    return onCanvasAddVideoRequest(({ url, fileName }: AddVideoPayload) => {
      const center = editor.screenToPage(editor.getViewportScreenCenter());
      editor.createShape({
        id: createShapeId(),
        type: VIDEO_SHAPE_TYPE,
        x: center.x - 240,
        y: center.y - 135,
        props: { w: 480, h: 270, videoUrl: url, fileName: fileName ?? "Rendered Video" },
      });
    });
  }, [editor]);

  // Listen for agent add_shape tool events
  useEffect(() => onCanvasAddShapeRequest((instruction) => {
    handleAddShape(editor, instruction);
    requestCanvasSave();
  }), [editor]);

  // Sync live shape list to useCanvasShapeStore
  useEffect(() => {
    const syncShapes = () => {
      useCanvasShapeStore.getState().setShapes(deriveShapeSummaries(editor));
    };
    syncShapes();
    return editor.store.listen(syncShapes, { source: "all", scope: "document" });
  }, [editor]);

  // Handle shape highlight from mention picker hover
  useEffect(() => {
    return onCanvasHighlightShape((shapeId) => {
      const shape = editor.getShape(shapeId as Parameters<typeof editor.getShape>[0]);
      if (shape) {
        editor.select(shape.id);
        editor.zoomToSelection({ animation: { duration: 200 } });
      }
    });
  }, [editor]);

  useEffect(() => {
    return onCanvasClearHighlight(() => {
      editor.selectNone();
    });
  }, [editor]);

  return null;
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
  setCanvasPropsStore({
    projectName,
    onSave: handleSave,
    isSaving,
    saveStatus,
  });

  return (
    <div className="relative h-full w-full" onDropCapture={handleDropCapture}>
      <Tldraw
        shapeUtils={[RichCardShapeUtil, VideoShapeUtil, AgentTurnShapeUtil]}
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
