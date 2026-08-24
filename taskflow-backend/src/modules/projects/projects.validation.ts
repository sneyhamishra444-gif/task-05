import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(5000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
