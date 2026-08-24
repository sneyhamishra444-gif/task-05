import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: "Route not found",
    code: "ROUTE_NOT_FOUND",
    details: { method: req.method, path: req.originalUrl },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "Request validation failed",
      code: "VALIDATION_ERROR",
      details: { issues: err.issues },
    });
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    details: {},
  });
}
