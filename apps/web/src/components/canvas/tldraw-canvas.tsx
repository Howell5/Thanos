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
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { addImageToCanvas, createImageAssetStore, isImageFile } from "@/lib/image-assets";
import { ROUTES } from "@/lib/routes";
import { useAIStore } from "@/stores/use-ai-store";
import { ArrowLeft, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BottomPromptPanel } from "./bottom-prompt-panel";
import { FloatingToolbar } from "./floating-toolbar";
import { GeneratingOverlay } from "./generating-overlay";

interface TldrawCanvasProps {
  projectId: string;
  projectName: string;
  canvasData?: unknown;
  onSave: (data: { document: unknown }) => Promise<void>;
  isSaving: boolean;
}

// Store for passing props to InFrontOfTheCanvas
let canvasPropsStore: {
  projectName: string;
  onSave: () => void;
  isSaving: boolean;
} | null = null;

// Component to handle drag and drop and keyboard shortcuts
function DropHandler() {
  const editor = useEditor();

  // Add keyboard shortcuts
  useKeyboardShortcuts(editor);

  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer?.files || []);
      const imageFiles = files.filter(isImageFile);

      for (const file of imageFiles) {
        try {
          await addImageToCanvas(editor, file);
        } catch (error) {
          console.error("Failed to add image:", error);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Add event listeners to the editor container
    const container = editor.getContainer();
    container.addEventListener("drop", handleDrop);
    container.addEventListener("dragover", handleDragOver);

    return () => {
      container.removeEventListener("drop", handleDrop);
      container.removeEventListener("dragover", handleDragOver);
    };
  }, [editor]);

  return null;
}

// Component rendered in front of the canvas (highest z-index)
function InFrontOfTheCanvas() {
  const props = canvasPropsStore;

  return (
    <>
      <FloatingToolbar />
      <BottomPromptPanel />
      <GeneratingOverlay />
      {/* Top Bar - positioned at top left */}
      <div className="fixed left-4 top-4 z-[300] flex items-center gap-2">
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
          disabled={props?.isSaving}
          className="border-gray-200 bg-white shadow-sm hover:bg-gray-50"
        >
          <Save className="mr-1.5 h-4 w-4" />
          {props?.isSaving ? "保存中..." : "保存"}
        </Button>
      </div>
    </>
  );
}

// Vertical toolbar component
function VerticalToolbar() {
  return <DefaultToolbar orientation="vertical" />;
}

// UI components configuration - hide unnecessary tldraw UI elements
// Keep: Toolbar (vertical), ContextMenu (right-click), Dialogs, Toasts
// Hide: StylePanel, NavigationPanel, MainMenu, PageMenu, ActionsMenu, HelpMenu, etc.
const uiComponents: TLUiComponents = {
  // Override toolbar to be vertical
  Toolbar: VerticalToolbar,
  // Hide panels we don't need
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
};

// Inner component that has access to the editor
function CanvasInner({
  canvasData,
  onSave,
}: {
  canvasData?: unknown;
  onSave: (data: { document: unknown }) => Promise<void>;
}) {
  const editor = useEditor();
  const hasLoadedRef = useRef(false);

  // Load canvas data on mount
  useEffect(() => {
    if (
      !hasLoadedRef.current &&
      canvasData &&
      typeof canvasData === "object" &&
      Object.keys(canvasData).length > 0
    ) {
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
      const { document } = getSnapshot(editor.store);
      await onSave({ document });
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

  return <DropHandler />;
}

export function TldrawCanvas({
  projectId,
  projectName,
  canvasData,
  onSave,
  isSaving,
}: TldrawCanvasProps) {
  const assetStore = useMemo(() => createImageAssetStore(), []);
  const { setProjectId } = useAIStore();
  const editorRef = useRef<Editor | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  // Set project ID for AI store
  useEffect(() => {
    setProjectId(projectId);
  }, [projectId, setProjectId]);

  // Track unsaved changes
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Track changes
    const unsubscribe = editor.store.listen(() => {
      hasUnsavedChangesRef.current = true;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;

    try {
      const { document } = getSnapshot(editorRef.current.store);
      await onSave({ document });
      hasUnsavedChangesRef.current = false;
      toast.success("保存成功");
    } catch {
      // Error is handled by the mutation
    }
  }, [onSave]);

  // Auto-save warning on beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Update props store for InFrontOfTheCanvas
  canvasPropsStore = {
    projectName,
    onSave: handleSave,
    isSaving,
  };

  return (
    <div className="relative h-full w-full">
      <Tldraw
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
