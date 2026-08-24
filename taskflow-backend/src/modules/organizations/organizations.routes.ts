import { Router } from "express";
import {
  listMembersHandler,
  addMemberHandler,
  updateMemberRoleHandler,
  removeMemberHandler,
} from "./organizations.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireOrgMembership, requireOrgAdmin } from "../../middleware/org.middleware";

// Mounted at /orgs/:orgId/members
const router = Router({ mergeParams: true });

router.use(authenticate, requireOrgMembership("orgId"));

// Any member of the org can see the member list.
router.get("/", listMembersHandler);

// Only org_admin can add/remove members or change roles.
router.post("/", requireOrgAdmin, addMemberHandler);
router.patch("/:userId/role", requireOrgAdmin, updateMemberRoleHandler);
router.delete("/:userId", requireOrgAdmin, removeMemberHandler);

export default router;
