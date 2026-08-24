import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { projects, tasks } from "../../db/schema";
import { Errors } from "../../utils/errors";
import type { CreateProjectInput, UpdateProjectInput } from "./projects.validation";
import { parsePagination, buildPaginatedResponse, PaginationQuery } from "../../utils/pagination";

/**
 * Every function takes `orgId` explicitly, sourced by the caller from
 * req.org.id (validated org membership) - never from the request body.
 * All queries additionally filter `deleted_at IS NULL` for soft delete.
 */

export async function listProjects(orgId: string, query: PaginationQuery) {
  const pagination = parsePagination(query);

  const whereClause = and(eq(projects.orgId, orgId), isNull(projects.deletedAt));

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(whereClause)
      .orderBy(projects.createdAt)
      .limit(pagination.limit)
      .offset(pagination.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(whereClause),
  ]);

  return buildPaginatedResponse(rows, count, pagination);
}

export async function getProject(orgId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.orgId, orgId),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);

  if (!project) {
    throw Errors.notFound("Project", "PROJECT_NOT_FOUND");
  }
  return project;
}

export async function createProject(
  orgId: string,
  userId: string,
  input: CreateProjectInput
) {
  const [project] = await db
    .insert(projects)
    .values({
      orgId,
      name: input.name,
      description: input.description,
      createdBy: userId,
    })
    .returning();
  return project;
}

export async function updateProject(
  orgId: string,
  projectId: string,
  input: UpdateProjectInput
) {
  // Confirm it exists & is in this org first, so we return 404 (not a
  // silent no-op) for a cross-tenant or already-deleted project id.
  await getProject(orgId, projectId);

  const [updated] = await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .returning();

  return updated;
}

/** Soft delete. Route-level middleware restricts this to org_admin. */
export async function deleteProject(orgId: string, projectId: string) {
  await getProject(orgId, projectId);

  await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
}

/** Task counts grouped by status, for the project dashboard. */
export async function getProjectDashboard(orgId: string, projectId: string) {
  await getProject(orgId, projectId);

  const rows = await db
    .select({
      status: tasks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.orgId, orgId),
        isNull(tasks.deletedAt)
      )
    )
    .groupBy(tasks.status);

  const counts: Record<string, number> = {
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return { projectId, total, byStatus: counts };
}
