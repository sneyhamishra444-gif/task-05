import Redis from "ioredis";
import { config } from "../config/env";

/**
 * Most managed Redis add-ons (Railway, Render Key Value, Upstash, ...)
 * expose a single connection string rather than discrete host/port vars.
 * Support both so deployment doesn't depend on knowing a platform's exact
 * variable-naming convention: REDIS_URL wins if set, otherwise fall back
 * to REDIS_HOST/REDIS_PORT/REDIS_PASSWORD (used by local dev and Docker
 * Compose, where discrete vars are simpler to read in one glance).
 */
export const redis = config.redis.url
  ? new Redis(config.redis.url, { maxRetriesPerRequest: null })
  : new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null, // required by BullMQ workers
    });

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Redis connection error:", err.message);
});
