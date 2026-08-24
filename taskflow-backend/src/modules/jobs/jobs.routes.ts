import { Router } from "express";
import { getJobHandler } from "./jobs.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/:jobId", authenticate, getJobHandler);

export default router;
