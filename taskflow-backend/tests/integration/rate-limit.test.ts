import request from "supertest";
import { resetDb, closeDb } from "../helpers/db";
import { redis } from "../../src/lib/redis";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await redis.quit();
  await closeDb();
});

describe("Auth: rate limiting", () => {
  it("returns 429 once the per-IP limit on /auth/* is exceeded", async () => {
    // Other integration test files also hit /auth/* under a much higher
    // limit; since rate-limiter-flexible keys purely by IP in the real
    // Redis instance (not per test-file), clear any counter left over
    // from earlier in the suite so this test starts from zero.
    const staleKeys = await redis.keys("rl:auth:*");
    if (staleKeys.length > 0) {
      await redis.del(...staleKeys);
    }

    // Build a fresh app instance in an isolated module registry with a
    // low, test-specific limit, so this doesn't affect (or get affected
    // by) the shared `app` used by every other integration test.
    let freshApp: import("express").Express;
    jest.isolateModules(() => {
      process.env.AUTH_RATE_LIMIT_MAX = "3";
      process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createApp } = require("../../src/app");
      freshApp = createApp();
    });

    for (let i = 0; i < 3; i++) {
      const res = await request(freshApp!)
        .post("/auth/login")
        .send({ email: "ratelimit@example.com", password: "wrong" });
      expect(res.status).toBe(401); // wrong credentials, but under the limit
    }

    const limited = await request(freshApp!)
      .post("/auth/login")
      .send({ email: "ratelimit@example.com", password: "wrong" });

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("RATE_LIMITED");
  });
});
