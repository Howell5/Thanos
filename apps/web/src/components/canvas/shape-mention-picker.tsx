/**
 * @shape mention picker dropdown.
 * Shows canvas shapes in a filterable list, with thumbnail/icon + brief.
 * Highlights shapes on the canvas when hovered.
 */

import {
  requestCanvasClearHighlight,
  requestCanvasHighlightShape,
} from "@/lib/canvas-events";
import {
  type CanvasShapeSummary,
  useCanvasShapeStore,
} from "@/stores/use-canvas-shape-store";
import { useEffect, useMemo, useRef } from "react";

interface ShapeMentionPickerProps {
  query: string;
  anchorRect: DOMRect;
  activeIndex: number;
  onSelect: (shape: CanvasShapeSummary) => void;
  onClose: () => void;
}

const SHAPE_TYPE_EMOJI: Record<string, string> = {
  image: "\u{1f5bc}",
  "canvas-video": "\u{1f3ac}",
  text: "\u{1f4dd}",
  geo: "\u{25fb}",
  arrow: "\u{2197}",
  draw: "\u{270f}",
  "rich-card": "\u{1f4c4}",
  "agent-turn": "\u{1f916}",
};

function ShapeIcon({ type }: { type: string }) {
  const emoji = SHAPE_TYPE_EMOJI[type] ?? "\u{1f4a0}";
  return <span className="text-sm leading-none">{emoji}</span>;
}

function ShapeThumbnail({ shape }: { shape: CanvasShapeSummary }) {
  if (shape.thumbnailUrl) {
    return (
      <img
        src={shape.thumbnailUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded border border-gray-100 object-cover"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-100 bg-gray-50">
      <ShapeIcon type={shape.type} />
    </div>
  );
}

export function ShapeMentionPicker({
  query,
  anchorRect,
  activeIndex,
  onSelect,
  onClose,
}: ShapeMentionPickerProps) {
  const shapes = useCanvasShapeStore((s) => s.shapes);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter shapes by query
  const filtered = useMemo(() => {
    if (!query) return shapes;
    const q = query.toLowerCase();
    return shapes.filter(
      (s) =>
        s.brief.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [shapes, query]);

  // Clamp activeIndex (-1 means no selection yet)
  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  // Highlight active shape on canvas
  useEffect(() => {
    if (clampedIndex >= 0) {
      const shape = filtered[clampedIndex];
      if (shape) {
        requestCanvasHighlightShape(shape.id);
      }
    }
    return () => {
      requestCanvasClearHighlight();
    };
  }, [filtered, clampedIndex]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.children[clampedIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex]);

  // Handle Enter key to select
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && filtered.length > 0 && clampedIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[clampedIndex]);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, clampedIndex, onSelect]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const list = listRef.current;
      if (list && !list.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately on the same click that triggered @
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Position above the textarea
  const style: React.CSSProperties = {
    position: "fixed",
    left: anchorRect.left,
    bottom: window.innerHeight - anchorRect.top + 4,
    width: anchorRect.width > 0 ? Math.min(anchorRect.width, 360) : 340,
    maxHeight: 240,
    zIndex: 400,
  };

  return (
    <div
      ref={listRef}
      style={style}
      className="overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-slate-400">
          {shapes.length === 0 ? "No shapes on canvas" : "No matching shapes"}
        </div>
      ) : (
        filtered.map((shape, idx) => (
          <button
            key={shape.id}
            type="button"
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-blue-50 ${
              idx === clampedIndex ? "bg-blue-50" : ""
            }`}
            onMouseEnter={() => requestCanvasHighlightShape(shape.id)}
            onMouseLeave={() => requestCanvasClearHighlight()}
            onClick={() => onSelect(shape)}
          >
            <ShapeThumbnail shape={shape} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-slate-700">{shape.brief}</div>
              <div className="text-[10px] text-slate-400">{shape.type} &middot; {shape.id}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
