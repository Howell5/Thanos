import type { ImageMeta } from "@/lib/image-assets";
import { useCallback, useEffect, useState } from "react";
import { useEditor } from "tldraw";

interface GeneratingShapeInfo {
  id: string;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
}

export function GeneratingOverlay() {
  const editor = useEditor();
  const [generatingShapes, setGeneratingShapes] = useState<GeneratingShapeInfo[]>([]);

  // Find all shapes that are currently generating
  const updateGeneratingShapes = useCallback(() => {
    const allShapes = editor.getCurrentPageShapes();

    const generating: GeneratingShapeInfo[] = [];

    for (const shape of allShapes) {
      const meta = shape.meta as unknown as ImageMeta;
      if (meta?.source === "generating") {
        // Get screen bounds
        const bounds = editor.getShapePageBounds(shape.id);
        if (bounds) {
          const screenTopLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y });
          const screenBottomRight = editor.pageToScreen({
            x: bounds.x + bounds.w,
            y: bounds.y + bounds.h,
          });

          generating.push({
            id: shape.id,
            screenX: screenTopLeft.x,
            screenY: screenTopLeft.y,
            screenWidth: screenBottomRight.x - screenTopLeft.x,
            screenHeight: screenBottomRight.y - screenTopLeft.y,
          });
        }
      }
    }

    setGeneratingShapes(generating);
  }, [editor]);

  // Listen for store changes and camera changes
  useEffect(() => {
    updateGeneratingShapes();

    const disposables = [editor.store.listen(() => updateGeneratingShapes())];

    return () => {
      disposables.forEach((d) => d());
    };
  }, [editor, updateGeneratingShapes]);

  if (generatingShapes.length === 0) {
    return null;
  }

  return (
    <>
      {generatingShapes.map((shape) => (
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
          {/* Gray background */}
          <div className="absolute inset-0 bg-gray-400" />

          {/* Animated particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute h-1.5 w-1.5 animate-float rounded-full bg-white opacity-60"
                style={{
                  left: `${10 + ((i * 12) % 80)}%`,
                  top: `${15 + ((i * 17) % 70)}%`,
                  animationDelay: `${i * 0.3}s`,
                  animationDuration: `${2 + (i % 3)}s`,
                }}
              />
            ))}
          </div>

          {/* Generating label */}
          <div className="absolute inset-0 flex items-end justify-center pb-6">
            <div className="rounded-lg bg-gray-800/80 px-4 py-2 backdrop-blur-sm">
              <span className="text-sm font-medium text-white">生成中...</span>
            </div>
          </div>
        </div>
      ))}

      {/* CSS for float animation */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-20px) scale(1.2);
            opacity: 0.9;
          }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
