import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
      /**
       * Populated only by requireOrgMembership, after verifying (via a DB
       * lookup) that req.user is actually a member of this org. Route
       * params like :orgId are never trusted on their own.
       */
      org?: {
        id: string;
        role: "org_admin" | "member";
      };
    }
  }
}
