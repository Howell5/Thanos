/**
 * Live canvas shape store.
 * Written to by CanvasEventHandler (inside tldraw tree).
 * Read by AgentChatPanel and shape mention picker (outside tldraw tree).
 */

import { create } from "zustand";

export interface CanvasShapeSummary {
  id: string; // "shape:abc123"
  type: string; // "image" | "canvas-video" | "text" | "geo" | ...
  brief: string; // one-line description, e.g. "image: photo.jpg (800x600)"
  thumbnailUrl: string | null; // CDN URL, data URI, or null
  x: number;
  y: number;
  w: number | null;
  h: number | null;
}

interface CanvasShapeStore {
  shapes: CanvasShapeSummary[];
  setShapes: (shapes: CanvasShapeSummary[]) => void;
}

export const useCanvasShapeStore = create<CanvasShapeStore>()((set) => ({
  shapes: [],
  setShapes: (shapes) => set({ shapes }),
}));
