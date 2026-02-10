import { findNonOverlappingPosition } from "@/lib/canvas-position";
import type { Editor, TLShapeId } from "tldraw";
import { AssetRecordType, createShapeId } from "tldraw";
import { RICH_CARD_SHAPE_TYPE } from "./rich-card-shape";
import { VIDEO_SHAPE_TYPE } from "./video-shape";

/**
 * Artifact extracted from tool output via heuristic detection
 */
export type Artifact =
  | { type: "image"; url: string; width?: number; height?: number }
  | { type: "video"; url: string; fileName?: string }
  | { type: "table"; title?: string; headers: string[]; rows: string[][] }
  | { type: "text"; content: string; format?: "markdown" | "plain" }
  | { type: "file"; name: string; url: string; mimeType?: string }
  | { type: "unknown"; raw: string };

const LAYOUT = {
  cardWidth: 400,
  cardHeight: 300,
};

/**
 * AgentRenderer - Places artifact shapes on the tldraw canvas.
 *
 * Process display (thinking, tool calls) is handled by AgentChatPanel.
 * This class only handles placing artifacts on canvas when requested.
 */
export class AgentRenderer {
  private editor: Editor;
  private artifactShapeIds: Map<number, TLShapeId> = new Map();

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Check if an artifact has already been placed on canvas
   */
  hasArtifact(index: number): boolean {
    return this.artifactShapeIds.has(index);
  }

  /**
   * Reset tracked artifact shapes (does not delete them from canvas)
   */
  reset(): void {
    this.artifactShapeIds.clear();
  }

  /**
   * Place a single artifact on the canvas.
   * Returns the created shape ID.
   */
  renderArtifact(artifact: Artifact, index: number): TLShapeId | null {
    if (this.artifactShapeIds.has(index)) return null;

    if (artifact.type === "image") {
      return this.renderImageArtifact(artifact, index);
    }
    if (artifact.type === "video") {
      return this.renderVideoArtifact(artifact, index);
    }
    return this.renderCardArtifact(artifact, index);
  }

  private renderImageArtifact(
    artifact: Extract<Artifact, { type: "image" }>,
    index: number,
  ): TLShapeId {
    const w = artifact.width || 320;
    const h = artifact.height || 320;
    const existingIds = [...this.artifactShapeIds.values()];
    const position = findNonOverlappingPosition(this.editor, existingIds, w, h);

    const shapeId = createShapeId();
    const assetId = AssetRecordType.createId();

    this.editor.createAssets([
      {
        id: assetId,
        type: "image",
        typeName: "asset",
        props: {
          name: `artifact-${index}.png`,
          src: artifact.url,
          w,
          h,
          mimeType: "image/png",
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    this.editor.createShape({
      id: shapeId,
      type: "image",
      x: position.x,
      y: position.y,
      props: { assetId, w, h },
    });

    this.artifactShapeIds.set(index, shapeId);
    return shapeId;
  }

  private renderVideoArtifact(
    artifact: Extract<Artifact, { type: "video" }>,
    index: number,
  ): TLShapeId {
    const w = 480;
    const h = 270;
    const existingIds = [...this.artifactShapeIds.values()];
    const position = findNonOverlappingPosition(this.editor, existingIds, w, h);

    const shapeId = createShapeId();
    this.editor.createShape({
      id: shapeId,
      type: VIDEO_SHAPE_TYPE,
      x: position.x,
      y: position.y,
      props: {
        w,
        h,
        videoUrl: artifact.url,
        fileName: artifact.fileName || "Rendered Video",
      },
    });

    this.artifactShapeIds.set(index, shapeId);
    return shapeId;
  }

  private renderCardArtifact(artifact: Artifact, index: number): TLShapeId {
    const template = artifact.type === "unknown" ? "text" : artifact.type;
    const existingIds = [...this.artifactShapeIds.values()];
    const position = findNonOverlappingPosition(
      this.editor,
      existingIds,
      LAYOUT.cardWidth,
      LAYOUT.cardHeight,
    );

    const shapeId = createShapeId();
    this.editor.createShape({
      id: shapeId,
      type: RICH_CARD_SHAPE_TYPE,
      x: position.x,
      y: position.y,
      props: {
        w: LAYOUT.cardWidth,
        h: LAYOUT.cardHeight,
        template,
        cardData: JSON.stringify(artifact),
        title: this.getArtifactTitle(artifact),
      },
    });

    this.artifactShapeIds.set(index, shapeId);
    return shapeId;
  }

  private getArtifactTitle(artifact: Artifact): string {
    switch (artifact.type) {
      case "text":
        return "Text Output";
      case "table":
        return artifact.title || "Table";
      case "file":
        return artifact.name;
      case "unknown":
        return "Output";
      default:
        return "Artifact";
    }
  }
}
