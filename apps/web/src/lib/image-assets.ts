import {
  AssetRecordType,
  type Editor,
  type TLAssetStore,
  type TLShapeId,
  createShapeId,
} from "tldraw";

// Re-export position utilities
export { findNonOverlappingPosition } from "./canvas-position";

// Upload function type for R2 uploads
type UploadToR2Fn = (file: File) => Promise<{ r2Url: string; id: string }>;

// Custom asset store for handling image uploads with R2
// This integrates with tldraw's native drag-and-drop handling
export const createImageAssetStoreWithUpload = (uploadToR2: UploadToR2Fn): TLAssetStore => {
  return {
    // Upload asset to R2 when files are dropped
    async upload(_asset, file) {
      try {
        // Upload to R2
        const result = await uploadToR2(file);
        return { src: result.r2Url };
      } catch (error) {
        console.error("Failed to upload to R2:", error);
        // Fallback to base64 data URL if upload fails
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ src: reader.result as string });
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      }
    },

    // Resolve asset URL (return as-is)
    resolve(asset) {
      return asset.props.src;
    },
  };
};

// Legacy asset store (base64 only, no R2 upload)
export const createImageAssetStore = (): TLAssetStore => {
  return {
    async upload(_asset, file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ src: reader.result as string });
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    resolve(asset) {
      return asset.props.src;
    },
  };
};

// Metadata for AI-generated images
export interface ImageMeta {
  source: "ai-generated" | "uploaded" | "generating" | "uploading";
  // Task ID for generating or uploading images
  taskId?: string;
  // AI generation info (only for ai-generated)
  modelId?: string;
  modelName?: string;
  prompt?: string;
  aspectRatio?: string;
  imageSize?: string;
  generatedAt?: number;
  // Database image ID (for berryon backend)
  imageId?: string;
  // Image dimensions (for all images)
  originalWidth?: number;
  originalHeight?: number;
  // Upload info (for uploading images)
  uploadTaskId?: string;
  localPreviewUrl?: string; // Temporary base64 preview during upload
  originalFileName?: string;
  // Index signature for JsonObject compatibility
  [key: string]: string | number | boolean | undefined;
}

// Get image dimensions from data URL or URL
export const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = url;
  });
};

// Check if file is an image
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith("image/");
};

// A 1x1 transparent PNG as placeholder
const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Default max dimension for images on canvas (keeps images at reasonable size)
export const DEFAULT_MAX_IMAGE_SIZE = 320;

// Calculate placeholder dimensions based on aspect ratio
export const getPlaceholderDimensions = (
  aspectRatio: string,
  baseSize = DEFAULT_MAX_IMAGE_SIZE,
): { width: number; height: number } => {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return { width: baseSize, height: baseSize };

  const ratio = w / h;
  if (ratio >= 1) {
    // Landscape or square: width is base, height is smaller
    return { width: baseSize, height: Math.round(baseSize / ratio) };
  }
  // Portrait: height is base, width is smaller
  return { width: Math.round(baseSize * ratio), height: baseSize };
};

// Options for creating placeholder shape
export interface PlaceholderOptions {
  taskId: string;
  aspectRatio: string;
  modelId: string;
  modelName: string;
  prompt: string;
  imageSize: string;
  position?: { x: number; y: number; anchorLeft?: boolean };
}

// Create a placeholder shape for generating image
export const createPlaceholderShape = (editor: Editor, options: PlaceholderOptions): string => {
  const { taskId, aspectRatio, modelId, modelName, prompt, imageSize, position } = options;

  // Calculate dimensions based on aspect ratio
  const { width, height } = getPlaceholderDimensions(aspectRatio);

  // Get position: custom or center of viewport
  const { x, y } = position ?? editor.getViewportScreenCenter();
  const anchorLeft = position?.anchorLeft ?? false;
  const finalX = anchorLeft ? x : x - width / 2;
  const finalY = y - height / 2;

  // Create asset for placeholder
  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      type: "image",
      typeName: "asset",
      props: {
        name: "placeholder",
        src: PLACEHOLDER_IMAGE,
        w: 1,
        h: 1,
        mimeType: "image/png",
        isAnimated: false,
      },
      meta: {},
    },
  ]);

  // Create placeholder shape
  const shapeId = createShapeId();
  editor.createShape({
    id: shapeId,
    type: "image",
    x: finalX,
    y: finalY,
    props: {
      assetId,
      w: width,
      h: height,
    },
    meta: {
      source: "generating",
      taskId,
      modelId,
      modelName,
      prompt,
      aspectRatio,
      imageSize,
    } as ImageMeta,
  });

  return shapeId;
};

// Update placeholder shape with real image (from URL)
export const updatePlaceholderWithImage = async (
  editor: Editor,
  shapeId: string,
  imageUrl: string,
  imageId?: string,
): Promise<void> => {
  const shape = editor.getShape(shapeId as TLShapeId);
  if (!shape || shape.type !== "image") return;

  // Get image dimensions
  const dimensions = await getImageDimensions(imageUrl);

  // Create new asset with real image
  const newAssetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: newAssetId,
      type: "image",
      typeName: "asset",
      props: {
        name: "generated-image.png",
        src: imageUrl,
        w: dimensions.width,
        h: dimensions.height,
        mimeType: "image/png",
        isAnimated: false,
      },
      meta: {},
    },
  ]);

  // Get current meta and update it
  const currentMeta = shape.meta as ImageMeta;
  const newMeta: ImageMeta = {
    source: "ai-generated",
    modelId: currentMeta.modelId,
    modelName: currentMeta.modelName,
    prompt: currentMeta.prompt,
    aspectRatio: currentMeta.aspectRatio,
    imageSize: currentMeta.imageSize,
    generatedAt: Date.now(),
    imageId,
    originalWidth: dimensions.width,
    originalHeight: dimensions.height,
  };

  // Update shape with new asset and meta
  editor.updateShape({
    id: shapeId as TLShapeId,
    type: "image",
    props: {
      assetId: newAssetId,
    },
    meta: newMeta as ImageMeta,
  });
};

// Remove placeholder shape (on error)
export const removePlaceholderShape = (editor: Editor, shapeId: string): void => {
  editor.deleteShape(shapeId as TLShapeId);
};

// Add image to canvas from URL
export const addImageFromUrl = async (
  editor: Editor,
  imageUrl: string,
  meta?: Partial<ImageMeta>,
) => {
  try {
    // Get image dimensions
    const dimensions = await getImageDimensions(imageUrl);

    // Create asset ID
    const assetId = AssetRecordType.createId();

    // Create asset
    editor.createAssets([
      {
        id: assetId,
        type: "image",
        typeName: "asset",
        props: {
          name: "image.png",
          src: imageUrl,
          w: dimensions.width,
          h: dimensions.height,
          mimeType: "image/png",
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    // Scale to reasonable size (max edge = 320px)
    let width = dimensions.width;
    let height = dimensions.height;
    const maxEdge = Math.max(width, height);

    if (maxEdge > DEFAULT_MAX_IMAGE_SIZE) {
      const scale = DEFAULT_MAX_IMAGE_SIZE / maxEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Get viewport bounds to calculate center
    const viewportBounds = editor.getViewportScreenBounds();
    const centerX = viewportBounds.w / 2 - width / 2;
    const centerY = viewportBounds.h / 2 - height / 2;

    // Place image at viewport center
    editor.createShape({
      type: "image",
      x: centerX,
      y: centerY,
      props: {
        assetId,
        w: width,
        h: height,
      },
      meta: {
        source: "uploaded",
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        ...meta,
      } as ImageMeta,
    });

    // Reset zoom to 100% at current position
    editor.resetZoom();
  } catch (error) {
    console.error("Failed to add image:", error);
    throw error;
  }
};
