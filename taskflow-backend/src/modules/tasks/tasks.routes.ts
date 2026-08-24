import { Router } from "express";
import { listTasksHandler, createTaskHandler } from "./tasks.controller";

// Mounted at /orgs/:orgId/projects/:projectId/tasks by projects.routes.ts,
// which already applied authenticate + requireOrgMembership.
const router = Router({ mergeParams: true });

router.get("/", listTasksHandler);
router.post("/", createTaskHandler);

export default router;
