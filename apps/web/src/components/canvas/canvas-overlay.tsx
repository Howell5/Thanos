/**
 * Canvas overlay components rendered in front of the tldraw canvas.
 * Extracted from tldraw-canvas.tsx to keep file under 500 lines.
 */

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { FloatingToolbar } from "./floating-toolbar";
import { GeneratingOverlay } from "./generating-overlay";
import { InpaintingOverlay } from "./inpainting-overlay";
import { UploadingOverlay } from "./uploading-overlay";

// Save status for UI feedback
export type SaveStatus = "idle" | "saving" | "saved";

// Store for passing props to InFrontOfTheCanvas
export let canvasPropsStore: {
  projectName: string;
  onSave: () => void;
  isSaving: boolean;
  saveStatus: SaveStatus;
} | null = null;

export function setCanvasPropsStore(props: typeof canvasPropsStore) {
  canvasPropsStore = props;
}

// Component rendered in front of the canvas (highest z-index)
export function InFrontOfTheCanvas() {
  const props = canvasPropsStore;
  return (
    <>
      <FloatingToolbar />
      <GeneratingOverlay />
      <InpaintingOverlay />
      <UploadingOverlay />
      {/* Top Bar — pointer-events-auto needed because tldraw's InFrontOfTheCanvas has pointer-events: none */}
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
