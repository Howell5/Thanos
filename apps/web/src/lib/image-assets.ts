import {
  AssetRecordType,
  type Editor,
  type TLAssetStore,
  type TLShapeId,
  createShapeId,
} from "tldraw";

// Re-export position utilities
export { findNonOverlappingPosition } from "./canvas-position";

// Custom asset store for handling image uploads
export const createImageAssetStore = (): TLAssetStore => {
  return {
    // Upload asset (convert File to base64 data URL for now)
    async upload(_asset, file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve({ src: dataUrl });
        };

        reader.onerror = () => {
          reject(new Error("Failed to read file"));
        };

        reader.readAsDataURL(file);
      });
    },

    // Resolve asset URL (return as-is since we're using data URLs)
    resolve(asset) {
      return asset.props.src;
    },
  };
};

// Metadata for AI-generated images
export interface ImageMeta {
  source: "ai-generated" | "uploaded" | "generating";
  // Task ID for generating images
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
  // Index signature for JsonObject compatibility
  [key: string]: string | number | boolean | undefined;
}

// Options for adding image to canvas
interface AddImageOptions {
  // Custom position. If anchorLeft is true, x is left edge; otherwise x is center
  position?: { x: number; y: number; anchorLeft?: boolean };
  // Metadata to attach to the shape
  meta?: ImageMeta;
}

// Helper function to add an image to the canvas
export const addImageToCanvas = async (editor: Editor, file: File, options?: AddImageOptions) => {
  // Get position: custom or center of viewport
  const { x, y } = options?.position ?? editor.getViewportScreenCenter();

  // Create asset ID
  const assetId = AssetRecordType.createId();

  // Read file as data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Get image dimensions
  const dimensions = await getImageDimensions(dataUrl);

  // Create asset
  editor.createAssets([
    {
      id: assetId,
      type: "image",
      typeName: "asset",
      props: {
        name: file.name,
        src: dataUrl,
        w: dimensions.width,
        h: dimensions.height,
        mimeType: file.type,
        isAnimated: false,
      },
      meta: {},
    },
  ]);

  // Create image shape at center of viewport
  const maxWidth = 800;
  const maxHeight = 600;
  let width = dimensions.width;
  let height = dimensions.height;

  // Scale down if too large
  if (width > maxWidth || height > maxHeight) {
    const scale = Math.min(maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;
  }

  // Calculate final position
  const anchorLeft = options?.position?.anchorLeft ?? false;
  const finalX = anchorLeft ? x : x - width / 2;
  const finalY = y - height / 2;

  // Build meta with defaults for uploaded images
  const meta: ImageMeta = options?.meta ?? {
    source: "uploaded",
    originalWidth: dimensions.width,
    originalHeight: dimensions.height,
  };

  // Always include original dimensions
  if (!meta.originalWidth) meta.originalWidth = dimensions.width;
  if (!meta.originalHeight) meta.originalHeight = dimensions.height;

  editor.createShape({
    type: "image",
    x: finalX,
    y: finalY,
    props: {
      assetId,
      w: width,
      h: height,
    },
    meta: meta as ImageMeta,
  });
};

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

// Calculate placeholder dimensions based on aspect ratio
export const getPlaceholderDimensions = (
  aspectRatio: string,
  baseSize = 500,
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

    // Scale to reasonable size
    const maxWidth = 500;
    const maxHeight = 400;
    let width = dimensions.width;
    let height = dimensions.height;

    if (width > maxWidth || height > maxHeight) {
      const scale = Math.min(maxWidth / width, maxHeight / height);
      width *= scale;
      height *= scale;
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
