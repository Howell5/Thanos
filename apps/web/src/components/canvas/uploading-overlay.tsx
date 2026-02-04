import type { ImageMeta } from "@/lib/image-assets";
import { type UploadTask, useAIStore } from "@/stores/use-ai-store";
import { useCallback, useEffect, useState } from "react";
import { type TLShapeId, useEditor } from "tldraw";

interface UploadingShapeInfo {
  id: string;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  task?: UploadTask;
}

export function UploadingOverlay() {
  const editor = useEditor();
  const { uploadTasks, retryUpload, cancelUpload } = useAIStore();
  const [uploadingShapes, setUploadingShapes] = useState<UploadingShapeInfo[]>([]);

  // Find all shapes that are currently uploading
  const updateUploadingShapes = useCallback(() => {
    const allShapes = editor.getCurrentPageShapes();

    const uploading: UploadingShapeInfo[] = [];

    for (const shape of allShapes) {
      const meta = shape.meta as unknown as ImageMeta;
      if (meta?.source === "uploading" && meta.uploadTaskId) {
        // Get screen bounds
        const bounds = editor.getShapePageBounds(shape.id);
        if (bounds) {
          const screenTopLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y });
          const screenBottomRight = editor.pageToScreen({
            x: bounds.x + bounds.w,
            y: bounds.y + bounds.h,
          });

          // Find the corresponding upload task
          const task = uploadTasks.get(meta.uploadTaskId);

          uploading.push({
            id: shape.id,
            screenX: screenTopLeft.x,
            screenY: screenTopLeft.y,
            screenWidth: screenBottomRight.x - screenTopLeft.x,
            screenHeight: screenBottomRight.y - screenTopLeft.y,
            task,
          });
        }
      }
    }

    setUploadingShapes(uploading);
  }, [editor, uploadTasks]);

  // Listen for store changes and camera changes
  useEffect(() => {
    updateUploadingShapes();

    const disposables = [editor.store.listen(() => updateUploadingShapes())];

    return () => {
      disposables.forEach((d) => d());
    };
  }, [editor, updateUploadingShapes]);

  // Handle retry
  const handleRetry = useCallback(
    async (taskId: string) => {
      try {
        await retryUpload(taskId);
      } catch (error) {
        console.error("Retry failed:", error);
      }
    },
    [retryUpload],
  );

  // Handle cancel
  const handleCancel = useCallback(
    (taskId: string, shapeId: string) => {
      cancelUpload(taskId);
      // Also delete the shape from canvas
      editor.deleteShape(shapeId as TLShapeId);
    },
    [cancelUpload, editor],
  );

  if (uploadingShapes.length === 0) {
    return null;
  }

  return (
    <>
      {uploadingShapes.map((shape) => {
        const task = shape.task;
        const isUploading = task?.status === "uploading";
        const isFailed = task?.status === "failed";
        const progress = task?.progress ?? 0;

        return (
          <div
            key={shape.id}
            className="pointer-events-none fixed z-40 overflow-hidden rounded-lg"
            style={{
              left: shape.screenX,
              top: shape.screenY,
              width: shape.screenWidth,
              height: shape.screenHeight,
            }}
          >
            {/* Semi-transparent overlay */}
            <div className="absolute inset-0 bg-black/30" />

            {/* Upload status */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              {isUploading && (
                <>
                  {/* Progress bar */}
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/30">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-white">上传中 {progress}%</span>
                </>
              )}

              {isFailed && task && (
                <>
                  <span className="text-xs font-medium text-red-300">上传失败</span>
                  <div className="pointer-events-auto flex gap-2">
                    <button
                      onClick={() => handleRetry(task.id)}
                      className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-white"
                    >
                      重试
                    </button>
                    <button
                      onClick={() => handleCancel(task.id, shape.id)}
                      className="rounded bg-red-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
