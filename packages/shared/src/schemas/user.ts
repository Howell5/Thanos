import { z } from "zod";

/**
 * Schema for updating user profile
 */
export const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
});

export type UpdateUser = z.infer<typeof updateUserSchema>;
