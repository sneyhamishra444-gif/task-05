import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  logoutAllHandler,
  meHandler,
} from "./auth.controller";
import { authRateLimit } from "../../middleware/rateLimiter.middleware";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// All /auth/* endpoints are rate-limited to 10 req/min/IP per requirement.
router.post("/register", authRateLimit, registerHandler);
router.post("/login", authRateLimit, loginHandler);
router.post("/refresh", authRateLimit, refreshHandler);
router.post("/logout", authRateLimit, logoutHandler);

// Bonus: logout of all devices. Requires a valid access token.
router.post("/logout-all", authRateLimit, authenticate, logoutAllHandler);

// Convenience endpoint to sanity-check a token / inspect the current user.
router.get("/me", authenticate, meHandler);

export default router;
