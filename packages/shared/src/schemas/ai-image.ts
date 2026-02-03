import { z } from "zod";

/**
 * AI Image schemas
 * For generating and managing AI-generated images
 */

/**
 * Supported aspect ratios
 */
export const aspectRatioSchema = z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]);

export type AspectRatio = z.infer<typeof aspectRatioSchema>;

/**
 * Supported AI models
 */
export const aiModelSchema = z.enum(["imagen-3.0-generate-001", "imagen-3.0-fast-001"]);

export type AIModel = z.infer<typeof aiModelSchema>;

/**
 * Schema for generating an AI image
 */
export const generateImageSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1, "Prompt is required").max(2000),
  negativePrompt: z.string().max(2000).optional(),
  aspectRatio: aspectRatioSchema.default("1:1"),
  model: aiModelSchema.default("imagen-3.0-generate-001"),
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
 * AI image response type (for frontend display)
 */
export interface AIImageResponse {
  id: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  aspectRatio: string;
  r2Url: string;
  width: number;
  height: number;
  creditsUsed: number;
  createdAt: string;
}
