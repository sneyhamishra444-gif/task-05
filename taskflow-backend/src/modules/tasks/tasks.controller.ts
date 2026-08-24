import { Request, Response, NextFunction } from "express";
import * as taskService from "./tasks.service";
import {
  createTaskSchema,
  updateTaskSchema,
  taskFiltersSchema,
  assignTaskSchema,
  bulkStatusUpdateSchema,
  searchTasksSchema,
} from "./tasks.validation";

export async function listTasksHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = taskFiltersSchema.parse(req.query);
    const result = await taskService.listTasksForProject(
      req.org!.id,
      req.params.projectId as string,
      filters
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createTaskSchema.parse(req.body);
    const task = await taskService.createTask(
      req.org!.id,
      req.params.projectId as string,
      req.user!.id,
      input
    );
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

export async function getTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await taskService.getTask(req.org!.id, req.params.taskId as string);
    res.status(200).json(task);
  } catch (err) {
    next(err);
  }
}

export async function updateTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateTaskSchema.parse(req.body);
    const task = await taskService.updateTask(req.org!.id, req.params.taskId as string, input);
    res.status(200).json(task);
  } catch (err) {
    next(err);
  }
}

export async function deleteTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await taskService.deleteTask(req.org!.id, req.params.taskId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function assignTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = assignTaskSchema.parse(req.body);
    const result = await taskService.assignUser(
      req.org!.id,
      req.params.taskId as string,
      input.userId,
      req.user!.id
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function unassignTaskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await taskService.unassignUser(
      req.org!.id,
      req.params.taskId as string,
      req.params.userId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listAssignmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const assignments = await taskService.listAssignments(
      req.org!.id,
      req.params.taskId as string
    );
    res.status(200).json({ data: assignments });
  } catch (err) {
    next(err);
  }
}

export async function bulkStatusUpdateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = bulkStatusUpdateSchema.parse(req.body);
    const result = await taskService.bulkUpdateStatus(req.org!.id, input);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function searchTasksHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = searchTasksSchema.parse(req.query);
    const result = await taskService.searchTasks(req.org!.id, input.q, input);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
