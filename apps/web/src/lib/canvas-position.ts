import type { Editor, TLShapeId } from "tldraw";

// Bounding box type
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Check if two bounding boxes overlap
const boxesOverlap = (a: BoundingBox, b: BoundingBox, gap = 0): boolean => {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
};

// Check if a box overlaps with any existing boxes
const overlapsAny = (box: BoundingBox, existingBoxes: BoundingBox[], gap: number): boolean => {
  return existingBoxes.some((existing) => boxesOverlap(box, existing, gap));
};

// Direction priorities for finding empty space
type Direction = "right" | "bottom" | "left" | "top";
const DIRECTIONS: Direction[] = ["right", "bottom", "left", "top"];

// Get candidate position based on direction
const getCandidatePosition = (
  anchorBox: BoundingBox,
  newWidth: number,
  newHeight: number,
  direction: Direction,
  gap: number,
): { x: number; y: number } => {
  switch (direction) {
    case "right":
      return {
        x: anchorBox.x + anchorBox.width + gap,
        y: anchorBox.y + anchorBox.height / 2 - newHeight / 2,
      };
    case "bottom":
      return {
        x: anchorBox.x + anchorBox.width / 2 - newWidth / 2,
        y: anchorBox.y + anchorBox.height + gap,
      };
    case "left":
      return {
        x: anchorBox.x - newWidth - gap,
        y: anchorBox.y + anchorBox.height / 2 - newHeight / 2,
      };
    case "top":
      return {
        x: anchorBox.x + anchorBox.width / 2 - newWidth / 2,
        y: anchorBox.y - newHeight - gap,
      };
  }
};

// Find a non-overlapping position for a new shape
export const findNonOverlappingPosition = (
  editor: Editor,
  anchorShapeIds: string[],
  newWidth: number,
  newHeight: number,
  options?: { gap?: number; excludeShapeIds?: string[] },
): { x: number; y: number } => {
  const gap = options?.gap ?? 30;
  const excludeIds = new Set(options?.excludeShapeIds ?? []);

  // Get all existing shape bounding boxes (excluding specified shapes)
  const allShapes = editor.getCurrentPageShapes();
  const existingBoxes: BoundingBox[] = allShapes
    .filter((shape) => !excludeIds.has(shape.id) && !anchorShapeIds.includes(shape.id))
    .map((shape) => {
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) return null;
      return { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h };
    })
    .filter((box): box is BoundingBox => box !== null);

  // Get anchor shapes bounding box (combined)
  let anchorBox: BoundingBox | null = null;
  for (const shapeId of anchorShapeIds) {
    const bounds = editor.getShapePageBounds(shapeId as TLShapeId);
    if (!bounds) continue;

    if (!anchorBox) {
      anchorBox = { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h };
    } else {
      // Expand to include this shape
      const minX = Math.min(anchorBox.x, bounds.x);
      const minY = Math.min(anchorBox.y, bounds.y);
      const maxX = Math.max(anchorBox.x + anchorBox.width, bounds.x + bounds.w);
      const maxY = Math.max(anchorBox.y + anchorBox.height, bounds.y + bounds.h);
      anchorBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
  }

  // If no anchor (text-to-image), use viewport center as virtual anchor point
  const hasRealAnchor = anchorBox !== null;
  if (!anchorBox) {
    // Get viewport center in page coordinates
    const viewportPageBounds = editor.getViewportPageBounds();
    const centerX = viewportPageBounds.x + viewportPageBounds.w / 2;
    const centerY = viewportPageBounds.y + viewportPageBounds.h / 2;
    // Create a zero-size anchor at viewport center
    anchorBox = { x: centerX, y: centerY, width: 0, height: 0 };
  }

  // For text-to-image (no real anchor), try placing at viewport center first
  // For image-to-image (has real anchor), skip this because it would overlap the anchor
  if (!hasRealAnchor) {
    const centeredCandidate: BoundingBox = {
      x: anchorBox.x + anchorBox.width / 2 - newWidth / 2,
      y: anchorBox.y + anchorBox.height / 2 - newHeight / 2,
      width: newWidth,
      height: newHeight,
    };

    if (!overlapsAny(centeredCandidate, existingBoxes, gap)) {
      return { x: centeredCandidate.x, y: centeredCandidate.y };
    }
  }

  // Try each direction, with increasing distance if needed
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const multiplier = attempt + 1;

    for (const direction of DIRECTIONS) {
      // Calculate effective gap for this attempt
      const effectiveGap = gap * multiplier;

      const candidate = getCandidatePosition(
        anchorBox,
        newWidth,
        newHeight,
        direction,
        effectiveGap,
      );
      const candidateBox: BoundingBox = {
        x: candidate.x,
        y: candidate.y,
        width: newWidth,
        height: newHeight,
      };

      if (!overlapsAny(candidateBox, existingBoxes, gap)) {
        return candidate;
      }
    }
  }

  // Fallback: place to the right with large offset
  return {
    x: anchorBox.x + anchorBox.width + gap * 5,
    y: anchorBox.y + anchorBox.height / 2 - newHeight / 2,
  };
};
