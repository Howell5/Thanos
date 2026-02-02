import { z } from "zod";

/**
 * Schema for creating a new post
 * Shared between backend validation and frontend forms
 */
export const createPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  content: z.string().min(1, "Content is required"),
});

export type CreatePost = z.infer<typeof createPostSchema>;

/**
 * Schema for updating a post
 */
export const updatePostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
});

export type UpdatePost = z.infer<typeof updatePostSchema>;

/**
 * Schema for post ID parameter
 */
export const postIdSchema = z.object({
  id: z.string().uuid(),
});

export type PostId = z.infer<typeof postIdSchema>;
