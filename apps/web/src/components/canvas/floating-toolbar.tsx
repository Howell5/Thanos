import type { ImageMeta } from "@/lib/image-assets";
import { useAIStore } from "@/stores/use-ai-store";
import { Copy, Download, Info, Paintbrush } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TLImageShape, type TLShapeId, createShapeId, useEditor } from "tldraw";

// Format timestamp to relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

export function FloatingToolbar() {
  const editor = useEditor();
  const { editMode, enterInpaintMode } = useAIStore();
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  // Close info popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        setShowInfo(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Track dragging state using tldraw's pointer state
  useEffect(() => {
    const checkDragging = () => {
      // Check if user is currently dragging (pointer is down and moving)
      const isDraggingNow = editor.inputs.isDragging;
      setIsDragging(isDraggingNow);
    };

    // Listen to pointer move events to detect dragging
    const interval = setInterval(checkDragging, 50);

    return () => {
      clearInterval(interval);
    };
  }, [editor]);

  // Update selection and position
  const updateSelection = useCallback(() => {
    const selectedShapes = editor.getSelectedShapes();

    // Check if exactly one image is selected
    if (selectedShapes.length === 1 && selectedShapes[0].type === "image") {
      const shape = selectedShapes[0] as TLImageShape;
      setSelectedImageId(shape.id);

      // Get the screen bounds of the shape
      const bounds = editor.getShapePageBounds(shape.id);
      if (bounds) {
        // Convert page coordinates to screen coordinates
        const screenPoint = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y });
        setToolbarPosition({
          x: screenPoint.x,
          y: screenPoint.y - 60, // Position above the shape
        });
      }
    } else {
      setSelectedImageId(null);
      setToolbarPosition(null);
      setShowInfo(false);
    }
  }, [editor]);

  // Listen for selection and camera changes
  useEffect(() => {
    updateSelection();

    const disposables = [editor.store.listen(() => updateSelection())];

    return () => {
      disposables.forEach((d) => d());
    };
  }, [editor, updateSelection]);

  // Get the image data URL from selected image
  const getSelectedImageDataUrl = (): string | null => {
    if (!selectedImageId) return null;

    const shape = editor.getShape(selectedImageId as TLShapeId) as TLImageShape;
    if (!shape || shape.type !== "image") return null;

    const assetId = shape.props.assetId;
    if (!assetId) return null;

    const asset = editor.getAsset(assetId);
    if (!asset || asset.type !== "image") return null;

    return asset.props.src || null;
  };

  // Get meta info from selected image
  const getSelectedImageMeta = (): ImageMeta | null => {
    if (!selectedImageId) return null;

    const shape = editor.getShape(selectedImageId as TLShapeId) as TLImageShape;
    if (!shape || shape.type !== "image") return null;

    return (shape.meta as unknown as ImageMeta) || null;
  };

  // Duplicate image and place it to the right of the original
  const handleCopy = () => {
    if (!selectedImageId) return;

    const shape = editor.getShape(selectedImageId as TLShapeId) as TLImageShape;
    if (!shape || shape.type !== "image") return;

    const newShapeId = createShapeId();
    editor.createShape({
      id: newShapeId,
      type: "image",
      x: shape.x + shape.props.w! + 20, // Place to the right with 20px gap
      y: shape.y,
      props: {
        assetId: shape.props.assetId,
        w: shape.props.w,
        h: shape.props.h,
      },
      meta: shape.meta, // Copy meta as well
    });

    editor.select(newShapeId);
  };

  // Download image
  const handleDownload = async () => {
    const meta = getSelectedImageMeta();

    // For uploading images, use the local preview URL if available
    let downloadUrl: string | null = null;
    if (meta?.source === "uploading" && meta.localPreviewUrl) {
      downloadUrl = meta.localPreviewUrl;
    } else {
      downloadUrl = getSelectedImageDataUrl();
    }

    if (!downloadUrl) return;

    try {
      // Handle both data URLs and regular URLs
      let blob: Blob;

      if (downloadUrl.startsWith("data:")) {
        // Convert data URL to blob
        const response = await fetch(downloadUrl);
        blob = await response.blob();
      } else {
        // Fetch from URL
        const response = await fetch(downloadUrl);
        blob = await response.blob();
      }

      // Create download link with original filename if available
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = meta?.originalFileName || `image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  };

  // Handle inpaint button click
  const handleInpaint = () => {
    const dataUrl = getSelectedImageDataUrl();
    if (!dataUrl || !selectedImageId) return;

    // Check if this is a generating placeholder or uploading
    const meta = getSelectedImageMeta();
    if (meta?.source === "generating") {
      alert("请等待图片生成完成");
      return;
    }
    if (meta?.source === "uploading") {
      alert("请等待图片上传完成");
      return;
    }

    // Enter inpaint mode with the selected image
    enterInpaintMode(selectedImageId, dataUrl);
  };

  // Check if current image is uploading
  const isUploading = getSelectedImageMeta()?.source === "uploading";

  // Hide toolbar when no image selected, no position, during drag, or in edit mode
  if (!selectedImageId || !toolbarPosition || isDragging || editMode !== "normal") {
    return null;
  }

  const meta = getSelectedImageMeta();

  // Note: pointer-events-auto is needed because tldraw's InFrontOfTheCanvas has pointer-events: none
  return (
    <div
      className="pointer-events-auto fixed z-50 flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-lg"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: "translateX(-50%)",
      }}
    >
      {/* Copy */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        title="复制图片"
      >
        <Copy className="h-4 w-4" />
        <span>复制</span>
      </button>

      {/* Download */}
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        title="下载图片"
      >
        <Download className="h-4 w-4" />
        <span>下载</span>
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Inpaint */}
      <button
        onClick={handleInpaint}
        disabled={isUploading}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
          isUploading
            ? "cursor-not-allowed text-gray-400"
            : "text-gray-700 hover:bg-gray-100"
        }`}
        title={isUploading ? "请等待图片上传完成" : "局部重绘"}
      >
        <Paintbrush className="h-4 w-4" />
        <span>局部重绘</span>
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Info */}
      <div className="relative" ref={infoRef}>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            showInfo ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-100"
          }`}
          title="图片信息"
        >
          <Info className="h-4 w-4" />
          <span>信息</span>
        </button>

        {/* Info Popover */}
        {showInfo && (
          <div className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">图片信息</p>
            </div>
            <div className="space-y-2.5 px-4 py-3">
              {/* Source */}
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-500">来源</span>
                <span className="text-xs font-medium text-gray-900">
                  {meta?.source === "ai-generated" ? "AI 生成" : "本地上传"}
                </span>
              </div>

              {/* Model (AI only) */}
              {meta?.source === "ai-generated" && meta.modelName && (
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-500">模型</span>
                  <span className="text-xs font-medium text-gray-900">{meta.modelName}</span>
                </div>
              )}

              {/* Resolution */}
              {meta?.originalWidth && meta?.originalHeight && (
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-500">分辨率</span>
                  <span className="text-xs font-medium text-gray-900">
                    {meta.originalWidth} × {meta.originalHeight}
                  </span>
                </div>
              )}

              {/* Aspect Ratio (AI only) */}
              {meta?.source === "ai-generated" && meta.aspectRatio && (
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-500">比例</span>
                  <span className="text-xs font-medium text-gray-900">{meta.aspectRatio}</span>
                </div>
              )}

              {/* Generated At (AI only) */}
              {meta?.source === "ai-generated" && meta.generatedAt && (
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-500">生成时间</span>
                  <span className="text-xs font-medium text-gray-900">
                    {formatRelativeTime(meta.generatedAt)}
                  </span>
                </div>
              )}

              {/* Prompt (AI only) */}
              {meta?.source === "ai-generated" && meta.prompt && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="mb-1 block text-xs text-gray-500">Prompt</span>
                  <p className="line-clamp-4 text-xs leading-relaxed text-gray-700">
                    {meta.prompt}
                  </p>
                </div>
              )}

              {/* No meta available */}
              {!meta && <p className="text-xs text-gray-500">暂无信息</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
