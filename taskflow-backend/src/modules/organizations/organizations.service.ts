import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { orgMembers, users } from "../../db/schema";
import { Errors, AppError } from "../../utils/errors";
import type { AddMemberInput, UpdateMemberRoleInput } from "./organizations.validation";

/**
 * Every function here takes `orgId` from req.org.id (already validated by
 * requireOrgMembership), never from the request body - this is what
 * "service-layer queries must be scoped by org_id" / "do not trust
 * client-provided org_id" means in practice.
 */

export async function listMembers(orgId: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: orgMembers.role,
      joinedAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId));
}

export async function addMember(orgId: string, input: AddMemberInput) {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    throw Errors.notFound("User with that email", "USER_NOT_FOUND");
  }

  const [existing] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1);

  if (existing) {
    throw new AppError(
      409,
      "ALREADY_MEMBER",
      "User is already a member of this organization"
    );
  }

  await db.insert(orgMembers).values({
    orgId,
    userId: user.id,
    role: input.role,
  });

  return { userId: user.id, email: user.email, name: user.name, role: input.role };
}

export async function updateMemberRole(
  orgId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput
) {
  const [updated] = await db
    .update(orgMembers)
    .set({ role: input.role })
    .where(
      and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId))
    )
    .returning();

  if (!updated) {
    throw Errors.notFound("Membership", "MEMBERSHIP_NOT_FOUND");
  }

  return updated;
}

export async function removeMember(orgId: string, targetUserId: string) {
  const [deleted] = await db
    .delete(orgMembers)
    .where(
      and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId))
    )
    .returning();

  if (!deleted) {
    throw Errors.notFound("Membership", "MEMBERSHIP_NOT_FOUND");
  }
}
