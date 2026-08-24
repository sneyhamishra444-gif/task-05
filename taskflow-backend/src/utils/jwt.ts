import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // user id
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // refresh_tokens.id - lets us look up/revoke the exact row
  type: "refresh";
}

export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { sub: userId, type: "access" };
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
  if (decoded.type !== "access") {
    throw new Error("Not an access token");
  }
  return decoded;
}

export function signRefreshToken(userId: string, tokenId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, jti: tokenId, type: "refresh" };
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: `${config.jwt.refreshTtlDays}d`,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
  if (decoded.type !== "refresh") {
    throw new Error("Not a refresh token");
  }
  return decoded;
}

/**
 * We never store raw refresh tokens in the DB - only a SHA-256 hash - so
 * that a database leak can't be replayed as a valid session. This is a
 * fast, deterministic hash (not bcrypt) because refresh tokens are already
 * high-entropy random JWTs, not low-entropy user passwords.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
