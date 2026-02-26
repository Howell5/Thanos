import type { ImageMeta } from "@/lib/image-assets";
import { useAIStore } from "@/stores/use-ai-store";
import { VIDEO_SHAPE_TYPE } from "./video-shape";
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

const SUPPORTED_TYPES = new Set(["image", VIDEO_SHAPE_TYPE]);

export function FloatingToolbar() {
  const editor = useEditor();
  const { editMode, enterInpaintMode } = useAIStore();
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedShapeType, setSelectedShapeType] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<ImageMeta | null>(null);
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

    // Check if exactly one supported shape is selected
    if (selectedShapes.length === 1 && SUPPORTED_TYPES.has(selectedShapes[0].type)) {
      const shape = selectedShapes[0];
      setSelectedShapeId(shape.id);
      setSelectedShapeType(shape.type);
      setSelectedMeta((shape.meta as unknown as ImageMeta) || null);

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
      setSelectedShapeId(null);
      setSelectedShapeType(null);
      setSelectedMeta(null);
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

  // Get download URL for selected shape
  const getSelectedDownloadUrl = (): string | null => {
    if (!selectedShapeId) return null;

    const shape = editor.getShape(selectedShapeId as TLShapeId);
    if (!shape) return null;

    if (shape.type === "image") {
      const imageShape = shape as TLImageShape;
      const assetId = imageShape.props.assetId;
      if (!assetId) return null;
      const asset = editor.getAsset(assetId);
      if (!asset || asset.type !== "image") return null;
      return asset.props.src || null;
    }

    if (shape.type === VIDEO_SHAPE_TYPE) {
      return (shape.props as Record<string, unknown>).videoUrl as string ?? null;
    }

    return null;
  };

  // Duplicate shape and place it to the right of the original
  const handleCopy = () => {
    if (!selectedShapeId) return;

    const shape = editor.getShape(selectedShapeId as TLShapeId);
    if (!shape) return;

    const props = shape.props as Record<string, unknown>;
    const w = (typeof props.w === "number" ? props.w : 320);

    const newShapeId = createShapeId();
    editor.createShape({
      id: newShapeId,
      type: shape.type,
      x: shape.x + w + 20,
      y: shape.y,
      props: shape.props,
      meta: shape.meta,
    });

    editor.select(newShapeId);
  };

  // Download shape media
  const handleDownload = async () => {
    const meta = selectedMeta;

    let downloadUrl: string | null = null;
    if (meta?.source === "uploading" && meta.localPreviewUrl) {
      downloadUrl = meta.localPreviewUrl;
    } else {
      downloadUrl = getSelectedDownloadUrl();
    }

    if (!downloadUrl) return;

    try {
      const response = await fetch(downloadUrl);
      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const isVideo = selectedShapeType === VIDEO_SHAPE_TYPE;
      link.download = meta?.originalFileName || `${isVideo ? "video" : "image"}-${Date.now()}.${isVideo ? "mp4" : "png"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  };

  // Handle inpaint button click (image only)
  const handleInpaint = () => {
    const dataUrl = getSelectedDownloadUrl();
    if (!dataUrl || !selectedShapeId || selectedShapeType !== "image") return;

    const meta = selectedMeta;
    if (meta?.source === "generating") {
      alert("请等待图片生成完成");
      return;
    }
    if (meta?.source === "uploading") {
      alert("请等待图片上传完成");
      return;
    }

    enterInpaintMode(selectedShapeId, dataUrl);
  };

  const isImage = selectedShapeType === "image";
  const isUploading = selectedMeta?.source === "uploading";

  // Hide toolbar when no shape selected, no position, during drag, or in edit mode
  if (!selectedShapeId || !toolbarPosition || isDragging || editMode !== "normal") {
    return null;
  }

  const meta = selectedMeta;

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
        title="复制"
      >
        <Copy className="h-4 w-4" />
        <span>复制</span>
      </button>

      {/* Download */}
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        title="下载"
      >
        <Download className="h-4 w-4" />
        <span>下载</span>
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Inpaint (image only) */}
      {isImage && (
        <>
          <button
            onClick={handleInpaint}
            disabled={isUploading}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              isUploading ? "cursor-not-allowed text-gray-400" : "text-gray-700 hover:bg-gray-100"
            }`}
            title={isUploading ? "请等待图片上传完成" : "局部重绘"}
          >
            <Paintbrush className="h-4 w-4" />
            <span>局部重绘</span>
          </button>

          {/* Divider */}
          <div className="mx-1 h-6 w-px bg-gray-200" />
        </>
      )}

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
          <div className="absolute bottom-full left-1/2 mb-2 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {isImage ? "图片信息" : "视频信息"}
              </p>
            </div>
            <div className="space-y-2.5 px-4 py-3">
              {/* File Name */}
              {meta?.originalFileName && (
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-xs text-gray-500">文件名</span>
                  <span className="truncate text-xs font-medium text-gray-900">
                    {meta.originalFileName}
                  </span>
                </div>
              )}

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

              {/* Duration (video only) */}
              {meta?.duration && (
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-500">时长</span>
                  <span className="text-xs font-medium text-gray-900">{meta.duration}s</span>
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

              {/* AI Description */}
              {meta?.description && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="mb-1 block text-xs text-gray-500">AI 描述</span>
                  <p className="line-clamp-6 text-xs leading-relaxed text-gray-700">
                    {meta.description}
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
