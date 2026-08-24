import { Router } from "express";
import {
  listProjectsHandler,
  getProjectHandler,
  createProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  projectDashboardHandler,
} from "./projects.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireOrgMembership, requireOrgAdmin } from "../../middleware/org.middleware";
import taskRoutes from "../tasks/tasks.routes";

const router = Router({ mergeParams: true });

router.use(authenticate, requireOrgMembership("orgId"));

router.get("/", listProjectsHandler);
router.post("/", createProjectHandler);
router.get("/:projectId", getProjectHandler);
router.patch("/:projectId", updateProjectHandler);
// "Admins can ... delete projects" (Task 02 requirement, enforced here).
router.delete("/:projectId", requireOrgAdmin, deleteProjectHandler);
router.get("/:projectId/dashboard", projectDashboardHandler);

// Tasks nested under a project: /orgs/:orgId/projects/:projectId/tasks
router.use("/:projectId/tasks", taskRoutes);

export default router;
