import { Request, Response, NextFunction } from "express";
import * as projectService from "./projects.service";
import { createProjectSchema, updateProjectSchema } from "./projects.validation";

export async function listProjectsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await projectService.listProjects(req.org!.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await projectService.getProject(req.org!.id, req.params.projectId as string);
    res.status(200).json(project);
  } catch (err) {
    next(err);
  }
}

export async function createProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createProjectSchema.parse(req.body);
    const project = await projectService.createProject(req.org!.id, req.user!.id, input);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
}

export async function updateProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateProjectSchema.parse(req.body);
    const project = await projectService.updateProject(
      req.org!.id,
      req.params.projectId as string,
      input
    );
    res.status(200).json(project);
  } catch (err) {
    next(err);
  }
}

export async function deleteProjectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await projectService.deleteProject(req.org!.id, req.params.projectId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function projectDashboardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await projectService.getProjectDashboard(
      req.org!.id,
      req.params.projectId as string
    );
    res.status(200).json(dashboard);
  } catch (err) {
    next(err);
  }
}
