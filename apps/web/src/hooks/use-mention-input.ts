/**
 * Hook for @mention detection in a textarea.
 * Detects @ trigger, extracts query, computes anchor position for popover.
 */

import type { CanvasShapeSummary } from "@/stores/use-canvas-shape-store";
import { useCallback, useRef, useState } from "react";

export interface MentionState {
  isOpen: boolean;
  query: string;
  anchorRect: DOMRect | null;
  triggerIndex: number;
  /** Index of the highlighted item in the picker (-1 = none) */
  activeIndex: number;
}

const INITIAL_STATE: MentionState = {
  isOpen: false,
  query: "",
  anchorRect: null,
  triggerIndex: -1,
  activeIndex: -1,
};

export interface UseMentionInputReturn {
  mentionState: MentionState;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  insertMention: (shape: CanvasShapeSummary) => void;
  closeMention: () => void;
}

/**
 * Compute a rough anchor rect for popover positioning based on textarea caret.
 */
function getCaretAnchorRect(textarea: HTMLTextAreaElement): DOMRect | null {
  const rect = textarea.getBoundingClientRect();
  // Position above the textarea, centered horizontally
  return new DOMRect(rect.left, rect.top, rect.width, 0);
}

export function useMentionInput(
  value: string,
  onChange: (v: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
): UseMentionInputReturn {
  const [mentionState, setMentionState] = useState<MentionState>(INITIAL_STATE);
  const stateRef = useRef(mentionState);
  stateRef.current = mentionState;

  const closeMention = useCallback(() => {
    setMentionState(INITIAL_STATE);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);

      // Find the last @ that starts a mention (preceded by start-of-string or whitespace)
      const atMatch = textBeforeCursor.match(/(^|[\s])@([^\s]*)$/);

      if (atMatch) {
        const query = atMatch[2];
        const triggerIndex = textBeforeCursor.lastIndexOf("@");
        const anchorRect = textareaRef.current ? getCaretAnchorRect(textareaRef.current) : null;

        setMentionState({
          isOpen: true,
          query,
          anchorRect,
          triggerIndex,
          activeIndex: 0,
        });
      } else if (stateRef.current.isOpen) {
        closeMention();
      }
    },
    [onChange, textareaRef, closeMention],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!stateRef.current.isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMention();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setMentionState((prev) => ({
          ...prev,
          activeIndex: prev.activeIndex + 1, // clamped in picker
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setMentionState((prev) => ({
          ...prev,
          activeIndex: Math.max(0, prev.activeIndex - 1),
        }));
      }
      // Enter is handled by the picker via onSelect callback
    },
    [closeMention],
  );

  const insertMention = useCallback(
    (shape: CanvasShapeSummary) => {
      const { triggerIndex } = stateRef.current;
      if (triggerIndex < 0) return;

      const textarea = textareaRef.current;
      // Read current value from DOM to avoid stale closure
      const currentValue = textarea?.value ?? value;
      const cursorPos = textarea?.selectionStart ?? currentValue.length;

      // Build display tag: @[brief] (e.g. @[image: "photo.jpg" (800x600)])
      const tag = `@[${shape.brief}] `;

      // Replace @query with the tag
      const before = currentValue.slice(0, triggerIndex);
      const after = currentValue.slice(cursorPos);
      const newValue = before + tag + after;

      onChange(newValue);
      closeMention();

      // Restore focus and cursor position after React re-render
      requestAnimationFrame(() => {
        if (textarea) {
          textarea.focus();
          const newCursor = before.length + tag.length;
          textarea.setSelectionRange(newCursor, newCursor);
        }
      });
    },
    [value, onChange, textareaRef, closeMention],
  );

  return { mentionState, handleChange, handleKeyDown, insertMention, closeMention };
}
