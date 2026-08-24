import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { users, organizations, orgMembers, refreshTokens } from "../../db/schema";
import { hashPassword, verifyPassword } from "../../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from "../../utils/jwt";
import { Errors } from "../../utils/errors";
import { config } from "../../config/env";
import type { RegisterInput, LoginInput } from "./auth.validation";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

interface AuthResult {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string; role: string };
  accessToken: string;
  refreshToken: string;
}

/**
 * Persists a new refresh token row and returns the signed JWT for it.
 * The JWT's `jti` claim points at the row so refresh/logout can look it
 * up directly by primary key instead of scanning by hash.
 */
async function issueRefreshToken(
  userId: string,
  ip: string | undefined,
  tx: typeof db = db
) {
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000
  );

  // Two-step: insert a placeholder to get an id, then update with the
  // hash of the token that embeds that id (the token needs the row's id,
  // and the row needs the token's hash - so we insert first, then patch).
  const [row] = await tx
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: "pending",
      expiresAt,
      createdByIp: ip,
    })
    .returning({ id: refreshTokens.id });

  const token = signRefreshToken(userId, row.id);

  await tx
    .update(refreshTokens)
    .set({ tokenHash: hashToken(token) })
    .where(eq(refreshTokens.id, row.id));

  return token;
}

export async function register(
  input: RegisterInput,
  ip?: string
): Promise<AuthResult> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw Errors.emailAlreadyRegistered();
  }

  const passwordHash = await hashPassword(input.password);

  const baseSlug = slugify(input.organizationName);
  let slug = baseSlug;
  let attempt = 0;
  // Simple collision-avoidance loop; org creation isn't hot-path/high
  // concurrency enough to need a fancier scheme.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (clash.length === 0) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash, name: input.name })
      .returning();

    const [org] = await tx
      .insert(organizations)
      .values({ name: input.organizationName, slug })
      .returning();

    await tx.insert(orgMembers).values({
      orgId: org.id,
      userId: user.id,
      role: "org_admin",
    });

    const accessToken = signAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id, ip, tx as unknown as typeof db);

    return { user, org, accessToken, refreshToken };
  });

  return {
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
    organization: {
      id: result.org.id,
      name: result.org.name,
      slug: result.org.slug,
      role: "org_admin",
    },
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

export async function login(input: LoginInput, ip?: string): Promise<AuthResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Same error for "no such user" and "wrong password" - don't leak which.
  if (!user) throw Errors.invalidCredentials();

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw Errors.invalidCredentials();

  const [membership] = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, user.id))
    .limit(1);

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id, ip);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    organization: membership
      ? {
          id: membership.orgId,
          name: membership.orgName,
          slug: membership.orgSlug,
          role: membership.role,
        }
      : { id: "", name: "", slug: "", role: "" },
    accessToken,
    refreshToken,
  };
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Refresh token rotation (bonus requirement): every successful refresh
 * revokes the presented token and issues a brand new one. If a refresh
 * token is presented that's already revoked, we treat that as a possible
 * theft/replay signal and revoke the entire chain by revoking all of the
 * user's active tokens, forcing re-login everywhere.
 */
export async function refresh(
  rawToken: string,
  ip?: string
): Promise<RefreshResult> {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw Errors.invalidRefreshToken();
  }

  const tokenHash = hashToken(rawToken);

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, payload.jti))
    .limit(1);

  if (!row || row.tokenHash !== tokenHash) {
    throw Errors.invalidRefreshToken();
  }

  if (row.expiresAt < new Date()) {
    throw Errors.invalidRefreshToken();
  }

  if (row.revokedAt) {
    // Reuse of a revoked/rotated token - possible token theft. Nuke every
    // active session for this user as a precaution.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt))
      );
    throw Errors.invalidRefreshToken();
  }

  const result = await db.transaction(async (tx) => {
    const newToken = await issueRefreshToken(
      row.userId,
      ip,
      tx as unknown as typeof db
    );

    // Look up the new row's id from the token we just minted so we can
    // link rotation lineage (replaced_by_token_id) for auditability.
    const newPayload = verifyRefreshToken(newToken);

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenId: newPayload.jti })
      .where(eq(refreshTokens.id, row.id));

    const accessToken = signAccessToken(row.userId);
    return { accessToken, refreshToken: newToken };
  });

  return result;
}

export async function logout(rawToken: string): Promise<void> {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    // Already invalid/expired - logout is idempotent, nothing to revoke.
    return;
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.id, payload.jti), isNull(refreshTokens.revokedAt))
    );
}

/** Bonus: logout of all devices - revokes every active token for a user. */
export async function logoutAll(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
