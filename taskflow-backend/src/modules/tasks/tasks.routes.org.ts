import { Router } from "express";
import {
  getTaskHandler,
  updateTaskHandler,
  deleteTaskHandler,
  assignTaskHandler,
  unassignTaskHandler,
  listAssignmentsHandler,
  bulkStatusUpdateHandler,
  searchTasksHandler,
} from "./tasks.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireOrgMembership } from "../../middleware/org.middleware";

// Mounted at /orgs/:orgId/tasks
const router = Router({ mergeParams: true });

router.use(authenticate, requireOrgMembership("orgId"));

// Bonus: bulk update + full-text search. Declared before /:taskId so
// "bulk-status" and "search" aren't swallowed as a :taskId param.
router.patch("/bulk-status", bulkStatusUpdateHandler);
router.get("/search", searchTasksHandler);

router.get("/:taskId", getTaskHandler);
router.patch("/:taskId", updateTaskHandler);
router.delete("/:taskId", deleteTaskHandler);

router.get("/:taskId/assignments", listAssignmentsHandler);
router.post("/:taskId/assignments", assignTaskHandler);
router.delete("/:taskId/assignments/:userId", unassignTaskHandler);

export default router;
