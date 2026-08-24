import { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { orgMembers } from "../db/schema";
import { Errors } from "../utils/errors";

/**
 * Resolves organization context for the request.
 *
 * IMPORTANT: the org id always comes from the URL param (e.g.
 * `/orgs/:orgId/...`), never from the request body, and it is never
 * trusted at face value - we look up an org_members row for
 * (req.user.id, orgId) and only proceed if one exists. If the user is not
 * a member of that org, we return 403 without revealing whether the org
 * itself exists (avoids leaking resource existence to non-members).
 */
export function requireOrgMembership(paramName = "orgId") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw Errors.unauthorized();
      }

      const orgId = req.params[paramName] as string | undefined;
      if (!orgId) {
        throw Errors.validation({ [paramName]: "Missing organization id in route" });
      }

      const [membership] = await db
        .select({ orgId: orgMembers.orgId, role: orgMembers.role })
        .from(orgMembers)
        .where(
          and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, req.user.id))
        )
        .limit(1);

      if (!membership) {
        // Deliberately 403, not 404: don't leak whether the org exists.
        throw Errors.forbidden(
          "You do not have access to this organization's resources"
        );
      }

      req.org = { id: membership.orgId, role: membership.role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Gate a route to org_admin only. Must run after requireOrgMembership. */
export function requireOrgAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!req.org) {
    return next(Errors.internal("requireOrgAdmin used without requireOrgMembership"));
  }
  if (req.org.role !== "org_admin") {
    return next(Errors.forbidden("This action requires the org_admin role"));
  }
  next();
}
