/**
 * All thrown errors that should reach the client as a structured JSON
 * response go through AppError, matching the required shape:
 *   { "error": "message", "code": "SOME_CODE", "details": {} }
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const Errors = {
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
  emailAlreadyRegistered: () =>
    new AppError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered"),
  unauthorized: (message = "Authentication required") =>
    new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have access to this resource") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (resource: string, code = "NOT_FOUND") =>
    new AppError(404, code, `${resource} not found`),
  validation: (details: Record<string, unknown>) =>
    new AppError(422, "VALIDATION_ERROR", "Request validation failed", details),
  invalidRefreshToken: () =>
    new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid, expired, or revoked"),
  rateLimited: () =>
    new AppError(429, "RATE_LIMITED", "Too many requests, please try again later"),
  internal: (message = "Internal server error") =>
    new AppError(500, "INTERNAL_ERROR", message),
};
