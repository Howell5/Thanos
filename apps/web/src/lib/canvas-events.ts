/**
 * Canvas event system for cross-component communication
 * Uses native CustomEvent for zero-dependency, decoupled event handling
 */

import type { CanvasShapeInstruction } from "@repo/shared";

// Canvas event types
export const CANVAS_EVENTS = {
  REQUEST_SAVE: "canvas:requestSave",
  SAVED: "canvas:saved",
  SAVE_ERROR: "canvas:saveError",
  REQUEST_ADD_VIDEO: "canvas:requestAddVideo",
  REQUEST_ADD_SHAPE: "canvas:requestAddShape",
} as const;

// Event payload types
export interface AddVideoPayload {
  url: string;
  fileName?: string;
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
