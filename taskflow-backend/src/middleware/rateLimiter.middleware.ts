import { Request, Response, NextFunction } from "express";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "../lib/redis";
import { config } from "../config/env";
import { Errors } from "../utils/errors";

/**
 * 10 requests/minute/IP across all /auth/* endpoints, per assignment
 * requirement. Backed by Redis (not in-memory) so the limit is enforced
 * correctly even when the API runs as multiple replicas.
 */
const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:auth",
  points: config.authRateLimit.max,
  duration: config.authRateLimit.windowMs / 1000,
});

export async function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = req.ip || "unknown";
  try {
    const result = await authLimiter.consume(key);
    res.setHeader("X-RateLimit-Limit", String(config.authRateLimit.max));
    res.setHeader("X-RateLimit-Remaining", String(result.remainingPoints));
    next();
  } catch (rejection: any) {
    if (rejection instanceof Error) {
      // Redis itself failed - fail open rather than locking everyone out,
      // but log loudly since this degrades a security control.
      // eslint-disable-next-line no-console
      console.error("Rate limiter error, failing open:", rejection.message);
      return next();
    }
    res.setHeader(
      "Retry-After",
      String(Math.ceil((rejection.msBeforeNext ?? 1000) / 1000))
    );
    next(Errors.rateLimited());
  }
}
