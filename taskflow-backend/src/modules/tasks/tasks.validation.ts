import { z } from "zod";

const statusEnum = z.enum(["todo", "in_progress", "review", "done"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.string().trim().max(10000).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  dueDate: z.coerce.date().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  dueDate: z.coerce.date().nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskFiltersSchema = z.object({
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  assignee: z.string().uuid().optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
export type TaskFiltersInput = z.infer<typeof taskFiltersSchema>;

export const assignTaskSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export const bulkStatusUpdateSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1, "At least one taskId is required").max(200),
  status: statusEnum,
});
export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;

export const searchTasksSchema = z.object({
  q: z.string().trim().min(1, "Query parameter 'q' is required"),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
export type SearchTasksInput = z.infer<typeof searchTasksSchema>;
