/**
 * Canvas event system for cross-component communication
 * Uses native CustomEvent for zero-dependency, decoupled event handling
 */

import type {
  CanvasShapeInstruction,
  MoveShapesPayload,
  ResizeShapesPayload,
  UpdateShapeMetaPayload,
} from "@repo/shared";

// Canvas event types
export const CANVAS_EVENTS = {
  REQUEST_SAVE: "canvas:requestSave",
  SAVED: "canvas:saved",
  SAVE_ERROR: "canvas:saveError",
  REQUEST_ADD_VIDEO: "canvas:requestAddVideo",
  REQUEST_ADD_SHAPE: "canvas:requestAddShape",
  HIGHLIGHT_SHAPE: "canvas:highlightShape",
  CLEAR_HIGHLIGHT: "canvas:clearHighlight",
  REQUEST_DESCRIBE: "canvas:requestDescribe",
  REQUEST_MOVE_SHAPES: "canvas:requestMoveShapes",
  REQUEST_RESIZE_SHAPES: "canvas:requestResizeShapes",
  REQUEST_UPDATE_SHAPE_META: "canvas:requestUpdateShapeMeta",
} as const;

// Event payload types
export interface AddVideoPayload {
  url: string;
  fileName?: string;
}

export interface DescribeRequestPayload {
  shapeId: string;
  projectId: string;
}

/**
 * Request canvas to save immediately (silent save)
 * Call this after operations like upload complete, AI generation complete, etc.
 */
export function requestCanvasSave() {
  window.dispatchEvent(new CustomEvent(CANVAS_EVENTS.REQUEST_SAVE));
}

/**
 * Subscribe to canvas save request events
 * @returns Unsubscribe function
 */
export function onCanvasSaveRequest(callback: () => void) {
  window.addEventListener(CANVAS_EVENTS.REQUEST_SAVE, callback);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_SAVE, callback);
}

/**
 * Notify that canvas was saved successfully
 */
export function notifyCanvasSaved() {
  window.dispatchEvent(new CustomEvent(CANVAS_EVENTS.SAVED));
}

/**
 * Subscribe to canvas saved events
 * @returns Unsubscribe function
 */
export function onCanvasSaved(callback: () => void) {
  window.addEventListener(CANVAS_EVENTS.SAVED, callback);
  return () => window.removeEventListener(CANVAS_EVENTS.SAVED, callback);
}

/**
 * Notify that canvas save failed
 */
export function notifyCanvasSaveError(error?: Error) {
  window.dispatchEvent(new CustomEvent(CANVAS_EVENTS.SAVE_ERROR, { detail: error }));
}

/**
 * Subscribe to canvas save error events
 * @returns Unsubscribe function
 */
export function onCanvasSaveError(callback: (error?: Error) => void) {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<Error | undefined>;
    callback(customEvent.detail);
  };
  window.addEventListener(CANVAS_EVENTS.SAVE_ERROR, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.SAVE_ERROR, handler);
}

/**
 * Request canvas to add a video shape
 * Called from outside tldraw context (e.g. AgentChatPanel)
 */
export function requestCanvasAddVideo(url: string, fileName?: string) {
  window.dispatchEvent(
    new CustomEvent<AddVideoPayload>(CANVAS_EVENTS.REQUEST_ADD_VIDEO, {
      detail: { url, fileName },
    }),
  );
}

/**
 * Subscribe to video add request events
 * @returns Unsubscribe function
 */
export function onCanvasAddVideoRequest(callback: (payload: AddVideoPayload) => void) {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<AddVideoPayload>;
    callback(customEvent.detail);
  };
  window.addEventListener(CANVAS_EVENTS.REQUEST_ADD_VIDEO, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_ADD_VIDEO, handler);
}

/**
 * Request canvas to add a shape (from agent add_shape tool)
 */
export function requestCanvasAddShape(instruction: CanvasShapeInstruction) {
  window.dispatchEvent(
    new CustomEvent<CanvasShapeInstruction>(CANVAS_EVENTS.REQUEST_ADD_SHAPE, {
      detail: instruction,
    }),
  );
}

/**
 * Subscribe to shape add request events
 * @returns Unsubscribe function
 */
export function onCanvasAddShapeRequest(callback: (instruction: CanvasShapeInstruction) => void) {
  const handler = (e: Event) => {
    callback((e as CustomEvent<CanvasShapeInstruction>).detail);
  };
  window.addEventListener(CANVAS_EVENTS.REQUEST_ADD_SHAPE, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_ADD_SHAPE, handler);
}

/**
 * Request canvas to highlight (select + zoom to) a specific shape
 */
export function requestCanvasHighlightShape(shapeId: string) {
  window.dispatchEvent(
    new CustomEvent<string>(CANVAS_EVENTS.HIGHLIGHT_SHAPE, { detail: shapeId }),
  );
}

/**
 * Request canvas to clear shape highlight
 */
export function requestCanvasClearHighlight() {
  window.dispatchEvent(new CustomEvent(CANVAS_EVENTS.CLEAR_HIGHLIGHT));
}

/**
 * Subscribe to shape highlight requests
 * @returns Unsubscribe function
 */
export function onCanvasHighlightShape(callback: (shapeId: string) => void) {
  const handler = (e: Event) => {
    callback((e as CustomEvent<string>).detail);
  };
  window.addEventListener(CANVAS_EVENTS.HIGHLIGHT_SHAPE, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.HIGHLIGHT_SHAPE, handler);
}

/**
 * Subscribe to clear highlight requests
 * @returns Unsubscribe function
 */
export function onCanvasClearHighlight(callback: () => void) {
  window.addEventListener(CANVAS_EVENTS.CLEAR_HIGHLIGHT, callback);
  return () => window.removeEventListener(CANVAS_EVENTS.CLEAR_HIGHLIGHT, callback);
}

/**
 * Request AI description for a shape (called after upload completes)
 */
export function requestShapeDescribe(payload: DescribeRequestPayload) {
  window.dispatchEvent(
    new CustomEvent<DescribeRequestPayload>(CANVAS_EVENTS.REQUEST_DESCRIBE, {
      detail: payload,
    }),
  );
}

/**
 * Subscribe to shape describe request events
 * @returns Unsubscribe function
 */
export function onShapeDescribeRequest(
  callback: (payload: DescribeRequestPayload) => void,
) {
  const handler = (e: Event) => {
    callback((e as CustomEvent<DescribeRequestPayload>).detail);
  };
  window.addEventListener(CANVAS_EVENTS.REQUEST_DESCRIBE, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_DESCRIBE, handler);
}

// ─── Canvas mutation events ──────────────────────────────────

export function requestCanvasMoveShapes(payload: MoveShapesPayload) {
  window.dispatchEvent(
    new CustomEvent<MoveShapesPayload>(CANVAS_EVENTS.REQUEST_MOVE_SHAPES, { detail: payload }),
  );
}

export function onCanvasMoveShapesRequest(callback: (payload: MoveShapesPayload) => void) {
  const handler = (e: Event) => callback((e as CustomEvent<MoveShapesPayload>).detail);
  window.addEventListener(CANVAS_EVENTS.REQUEST_MOVE_SHAPES, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_MOVE_SHAPES, handler);
}

export function requestCanvasResizeShapes(payload: ResizeShapesPayload) {
  window.dispatchEvent(
    new CustomEvent<ResizeShapesPayload>(CANVAS_EVENTS.REQUEST_RESIZE_SHAPES, { detail: payload }),
  );
}

export function onCanvasResizeShapesRequest(callback: (payload: ResizeShapesPayload) => void) {
  const handler = (e: Event) => callback((e as CustomEvent<ResizeShapesPayload>).detail);
  window.addEventListener(CANVAS_EVENTS.REQUEST_RESIZE_SHAPES, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_RESIZE_SHAPES, handler);
}

export function requestCanvasUpdateShapeMeta(payload: UpdateShapeMetaPayload) {
  window.dispatchEvent(
    new CustomEvent<UpdateShapeMetaPayload>(CANVAS_EVENTS.REQUEST_UPDATE_SHAPE_META, {
      detail: payload,
    }),
  );
}

export function onCanvasUpdateShapeMetaRequest(
  callback: (payload: UpdateShapeMetaPayload) => void,
) {
  const handler = (e: Event) => callback((e as CustomEvent<UpdateShapeMetaPayload>).detail);
  window.addEventListener(CANVAS_EVENTS.REQUEST_UPDATE_SHAPE_META, handler);
  return () => window.removeEventListener(CANVAS_EVENTS.REQUEST_UPDATE_SHAPE_META, handler);
}
