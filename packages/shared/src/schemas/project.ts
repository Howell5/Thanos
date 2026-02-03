import { z } from "zod";

/**
 * Project schemas
 * For creating, updating, and validating canvas projects
 */

/**
 * Schema for creating a new project
 */
export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
});

export type CreateProject = z.infer<typeof createProjectSchema>;

/**
 * Schema for updating a project
 */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  canvasData: z.any().optional(), // tldraw TLRecord[] - any JSON data
  thumbnail: z.string().url().optional(),
  isPublic: z.boolean().optional(),
});

export type UpdateProject = z.infer<typeof updateProjectSchema>;

/**
 * Schema for project ID parameter
 */
export const projectIdSchema = z.object({
  id: z.string().uuid(),
});

export type ProjectId = z.infer<typeof projectIdSchema>;

/**
 * Schema for project ID in body (for PATCH operations)
 */
export const projectIdBodySchema = z.object({
  projectId: z.string().uuid(),
});

export type ProjectIdBody = z.infer<typeof projectIdBodySchema>;
