import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { verifyAccessToken } from "../utils/jwt";
import { Errors } from "../utils/errors";

/**
 * Verifies the JWT access token and attaches the authenticated user to
 * req.user. Does NOT attach organization context - that's a separate,
 * explicit step (see org.middleware.ts) because a user can belong to
 * multiple organizations and the "current" org must come from a validated
 * membership lookup, never trusted blindly from the token or the request.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw Errors.unauthorized("Missing or malformed Authorization header");
    }
    const token = header.slice("Bearer ".length).trim();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw Errors.unauthorized("Invalid or expired access token");
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      throw Errors.unauthorized("User no longer exists");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
