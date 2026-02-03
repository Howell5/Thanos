import { useAIStore } from "@/stores/use-ai-store";
import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TLShapeId, useEditor } from "tldraw";

// Default brush size
const DEFAULT_BRUSH_SIZE = 30;
const MIN_BRUSH_SIZE = 5;
const MAX_BRUSH_SIZE = 100;

interface Point {
  x: number;
  y: number;
}

export function InpaintingOverlay() {
  const editor = useEditor();
  const { editMode, inpaintTarget, exitInpaintMode } = useAIStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  // Image bounds in screen coordinates
  const [imageBounds, setImageBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Update image bounds when editor state changes
  useEffect(() => {
    if (editMode !== "inpaint" || !inpaintTarget) {
      setImageBounds(null);
      return;
    }

    const updateBounds = () => {
      const shape = editor.getShape(inpaintTarget.shapeId as TLShapeId);
      if (!shape) return;

      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) return;

      // Convert page bounds to screen bounds
      const screenPoint = editor.pageToScreen({ x: bounds.x, y: bounds.y });
      const screenEndPoint = editor.pageToScreen({
        x: bounds.x + bounds.w,
        y: bounds.y + bounds.h,
      });

      setImageBounds({
        x: screenPoint.x,
        y: screenPoint.y,
        width: screenEndPoint.x - screenPoint.x,
        height: screenEndPoint.y - screenPoint.y,
      });
    };

    updateBounds();

    // Listen for camera changes
    const unsubscribe = editor.store.listen(updateBounds, {
      scope: "document",
      source: "user",
    });

    return () => unsubscribe();
  }, [editor, editMode, inpaintTarget]);

  // Initialize canvas when bounds change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBounds) return;

    canvas.width = imageBounds.width;
    canvas.height = imageBounds.height;

    // Clear canvas
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [imageBounds]);

  // Draw on canvas
  const drawLine = useCallback(
    (from: Point, to: Point) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageBounds) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw with red semi-transparent color for preview
      ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      // Draw circle at point for smoother appearance
      ctx.beginPath();
      ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    },
    [brushSize, imageBounds],
  );

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!imageBounds) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      setIsDrawing(true);
      setLastPoint(point);

      // Draw a dot at the starting point
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
          ctx.beginPath();
          ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    [imageBounds, brushSize],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !lastPoint || !imageBounds) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      drawLine(lastPoint, point);
      setLastPoint(point);
    },
    [isDrawing, lastPoint, imageBounds, drawLine],
  );

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    setLastPoint(null);
  }, []);

  // Export mask as base64 (white on black)
  const exportMask = useCallback((): string => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBounds) return "";

    // Create a new canvas for the mask
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;

    const ctx = maskCanvas.getContext("2d");
    if (!ctx) return "";

    // Fill with black (areas to keep)
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Draw original canvas content as white (areas to regenerate)
    ctx.globalCompositeOperation = "source-over";

    // Get the original canvas image data
    const originalCtx = canvas.getContext("2d");
    if (!originalCtx) return "";

    const imageData = originalCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convert to white mask where there was any drawing
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        // If there's any color, make it white
        ctx.fillStyle = "white";
        const x = (i / 4) % canvas.width;
        const y = Math.floor(i / 4 / canvas.width);
        ctx.fillRect(x, y, 1, 1);
      }
    }

    return maskCanvas.toDataURL("image/png");
  }, [imageBounds]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editMode !== "inpaint") return;

      if (e.key === "Escape") {
        exitInpaintMode();
      } else if (e.key === "[") {
        setBrushSize((s) => Math.max(MIN_BRUSH_SIZE, s - 5));
      } else if (e.key === "]") {
        setBrushSize((s) => Math.min(MAX_BRUSH_SIZE, s + 5));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editMode, exitInpaintMode]);

  // Expose exportMask function via ref or store
  useEffect(() => {
    // Store the export function in window for access from BottomPromptPanel
    // This is a simple approach; could also use a ref or context
    (window as unknown as { __exportInpaintMask?: () => string }).__exportInpaintMask = exportMask;

    return () => {
      delete (window as unknown as { __exportInpaintMask?: () => string }).__exportInpaintMask;
    };
  }, [exportMask]);

  // Don't render if not in inpaint mode
  if (editMode !== "inpaint" || !inpaintTarget || !imageBounds) {
    return null;
  }

  return (
    <>
      {/* Semi-transparent overlay for the entire canvas */}
      <div className="pointer-events-none fixed inset-0 z-[150] bg-black/30" />

      {/* Drawing canvas positioned over the image */}
      <div
        className="pointer-events-auto fixed z-[151]"
        style={{
          left: imageBounds.x,
          top: imageBounds.y,
          width: imageBounds.width,
          height: imageBounds.height,
        }}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-auto cursor-crosshair"
          style={{ width: "100%", height: "100%" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Brush size controls */}
      <div className="pointer-events-auto fixed left-4 top-1/2 z-[200] flex -translate-y-1/2 flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
        <button
          onClick={() => setBrushSize((s) => Math.min(MAX_BRUSH_SIZE, s + 5))}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
          title="增大画笔 (])"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="flex h-10 w-10 items-center justify-center">
          <div
            className="rounded-full bg-red-500/50"
            style={{
              width: Math.min(brushSize, 40),
              height: Math.min(brushSize, 40),
            }}
          />
        </div>

        <span className="text-xs text-gray-500">{brushSize}px</span>

        <button
          onClick={() => setBrushSize((s) => Math.max(MIN_BRUSH_SIZE, s - 5))}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
          title="减小画笔 ([)"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* Instructions and cancel button */}
      <div className="pointer-events-auto fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-lg">
        <span className="text-sm text-gray-600">在图片上绘制需要重绘的区域</span>
        <button
          onClick={exitInpaintMode}
          className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
        >
          <X className="h-4 w-4" />
          取消 (Esc)
        </button>
      </div>
    </>
  );
}
