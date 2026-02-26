import { z } from "zod";

/**
 * AI Image schemas
 * For generating and managing AI-generated images and user-uploaded images
 */

/**
 * Image source type
 * - "ai": AI-generated image
 * - "upload": User-uploaded image
 */
export const imageSourceSchema = z.enum(["ai", "upload"]);
export type ImageSource = z.infer<typeof imageSourceSchema>;

/**
 * Supported aspect ratios
 * Full list from Gemini docs: 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
 */
export const aspectRatioSchema = z.enum([
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

export type AspectRatio = z.infer<typeof aspectRatioSchema>;

/**
 * Supported image sizes (resolutions)
 * - 1K: 1024px - Social media, web display
 * - 2K: 2048px - High quality content
 * - 4K: 4096px - Professional design, printing (higher cost)
 */
export const imageSizeSchema = z.enum(["1K", "2K", "4K"]);

export type ImageSize = z.infer<typeof imageSizeSchema>;

/**
 * Supported AI models for image generation
 * - gemini-2.5-flash-image: Fast image generation (nanobanana)
 * - gemini-3-pro-image-preview: High quality image generation (nanobanana pro)
 */
export const aiModelSchema = z.enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]);

export type AIModel = z.infer<typeof aiModelSchema>;

/**
 * Schema for generating an AI image
 */
export const generateImageSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1, "Prompt is required").max(2000),
  negativePrompt: z.string().max(2000).optional(),
  aspectRatio: aspectRatioSchema.default("1:1"),
  imageSize: imageSizeSchema.default("1K"),
  model: aiModelSchema.default("gemini-2.5-flash-image"),
  // Number of images to generate (1-4, default 1)
  numberOfImages: z.coerce.number().int().min(1).max(4).default(1),
  // Reference images for image-to-image generation (base64 strings, max 3 for flash, 14 for pro)
  referenceImages: z
    .array(z.string().min(1))
    .max(14, "Maximum 14 reference images allowed")
    .optional(),
});

export type GenerateImage = z.infer<typeof generateImageSchema>;

/**
 * Schema for generation history query
 */
export const generationHistorySchema = z.object({
  projectId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type GenerationHistory = z.infer<typeof generationHistorySchema>;

/**
 * Schema for inpainting an image
 * Inpainting replaces a masked region of an image with AI-generated content
 */
export const inpaintImageSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1, "Prompt is required").max(2000),
  // Original image data (base64 string)
  imageData: z.string().min(1, "Image data is required"),
  // Mask data (base64 string) - white pixels indicate areas to regenerate
  maskData: z.string().min(1, "Mask data is required"),
});

export type InpaintImage = z.infer<typeof inpaintImageSchema>;

/**
 * Schema for outpainting an image
 * Outpainting extends an image beyond its original boundaries
 */
export const outpaintDirectionSchema = z.enum(["top", "bottom", "left", "right", "all"]);

export type OutpaintDirection = z.infer<typeof outpaintDirectionSchema>;

export const outpaintImageSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1, "Prompt is required").max(2000),
  // Original image data (base64 string)
  imageData: z.string().min(1, "Image data is required"),
  // Direction to extend the image
  direction: outpaintDirectionSchema,
});

export type OutpaintImage = z.infer<typeof outpaintImageSchema>;

/**
 * AI image response type (for frontend display)
 */
export interface AIImageResponse {
  id: string;
  source: ImageSource;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  originalFileName?: string;
  r2Url: string;
  width: number;
  height: number;
  creditsUsed: number;
  createdAt: string;
}

/**
 * Maximum file size for image upload (10MB)
 */
export const MAX_IMAGE_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Maximum file size for video upload (50MB)
 */
export const MAX_VIDEO_UPLOAD_SIZE = 50 * 1024 * 1024;

/**
 * Maximum upload size (largest of image/video limits, used for presign validation)
 */
export const MAX_UPLOAD_SIZE = MAX_VIDEO_UPLOAD_SIZE;

/**
 * Allowed MIME types for image upload
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/**
 * Allowed MIME types for video upload
 */
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

/**
 * All allowed upload MIME types (images + videos)
 */
export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/**
 * Check if a MIME type is a video type
 */
export function isVideoType(mimeType: string): boolean {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Get the max upload size for a given MIME type
 */
export function getMaxUploadSize(mimeType: string): number {
  return isVideoType(mimeType) ? MAX_VIDEO_UPLOAD_SIZE : MAX_IMAGE_UPLOAD_SIZE;
}

/**
 * Schema for uploading an image (legacy - used for form data)
 */
export const uploadImageSchema = z.object({
  projectId: z.string().uuid(),
});

export type UploadImage = z.infer<typeof uploadImageSchema>;

/**
 * Schema for requesting a presigned upload URL
 * Client will use this URL to upload directly to R2
 */
export const presignUploadSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_SIZE),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
});

export type PresignUpload = z.infer<typeof presignUploadSchema>;

/**
 * Schema for confirming upload completion
 * Called after client successfully uploads to R2
 */
export const confirmUploadSchema = z.object({
  projectId: z.string().uuid(),
  key: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  fileSize: z.number().int().positive(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  // tldraw shape ID for triggering auto-describe
  shapeId: z.string().optional(),
});

export type ConfirmUpload = z.infer<typeof confirmUploadSchema>;

/**
 * Upload image response (legacy)
 */
export interface UploadImageResponse {
  id: string;
  r2Url: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  originalFileName: string;
}

/**
 * Presigned upload URL response
 */
export interface PresignUploadResponse {
  uploadUrl: string;
  cdnUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Confirm upload response
 */
export interface ConfirmUploadResponse {
  id: string;
  r2Url: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  originalFileName: string;
}
