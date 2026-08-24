import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import swaggerUi from "swagger-ui-express";

import authRoutes from "./modules/auth/auth.routes";
import orgMemberRoutes from "./modules/organizations/organizations.routes";
import projectRoutes from "./modules/projects/projects.routes";
import orgTaskRoutes from "./modules/tasks/tasks.routes.org";
import jobRoutes from "./modules/jobs/jobs.routes";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";

/**
 * Resolves docs/openapi.yaml regardless of whether we're running via
 * ts-node (src/app.ts) or the compiled build (dist/src/app.js) - both are
 * normally launched with the project root as cwd, but this also falls
 * back to a path relative to this file so it's robust either way.
 */
function loadOpenApiSpec(): Record<string, unknown> | null {
  const candidates = [
    path.join(process.cwd(), "docs", "openapi.yaml"),
    path.join(__dirname, "..", "docs", "openapi.yaml"),
    path.join(__dirname, "..", "..", "docs", "openapi.yaml"),
  ];
  const specPath = candidates.find((p) => fs.existsSync(p));
  if (!specPath) return null;
  return YAML.parse(fs.readFileSync(specPath, "utf-8"));
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan(process.env.NODE_ENV === "test" ? "tiny" : "dev"));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // API documentation (Task 05): Swagger UI over the OpenAPI spec.
  const openApiSpec = loadOpenApiSpec();
  if (openApiSpec) {
    app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  }

  app.use("/auth", authRoutes);
  app.use("/orgs/:orgId/members", orgMemberRoutes);
  app.use("/orgs/:orgId/projects", projectRoutes);
  app.use("/orgs/:orgId/tasks", orgTaskRoutes);
  app.use("/jobs", jobRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
