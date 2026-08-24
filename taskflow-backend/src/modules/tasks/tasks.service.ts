import { and, asc, desc, eq, gte, isNull, lte, sql, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { tasks, projects, taskAssignments, orgMembers, users } from "../../db/schema";
import { Errors, AppError } from "../../utils/errors";
import { enqueueAssignmentEmail } from "../../lib/queue";
import { parsePagination, buildPaginatedResponse } from "../../utils/pagination";
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskFiltersInput,
  BulkStatusUpdateInput,
} from "./tasks.validation";

/**
 * As with projects, every function takes `orgId` explicitly (sourced from
 * req.org.id) and re-checks it in the WHERE clause of every query -
 * that's the actual enforcement of "service-layer queries must be scoped
 * by org_id" / "do not trust client-provided org_id". A task whose
 * project_id exists but belongs to another org, or whose task id exists
 * but org_id doesn't match, is treated as not found (404), not 403 -
 * consistent with not leaking cross-tenant existence.
 */

async function assertProjectInOrg(orgId: string, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
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
}

export async function listTasksForProject(
  orgId: string,
  projectId: string,
  filters: TaskFiltersInput
) {
  await assertProjectInOrg(orgId, projectId);

  const pagination = parsePagination(filters);

  const conditions = [
    eq(tasks.projectId, projectId),
    eq(tasks.orgId, orgId),
    isNull(tasks.deletedAt),
  ];

  if (filters.status) conditions.push(eq(tasks.status, filters.status));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.dueDateFrom) conditions.push(gte(tasks.dueDate, filters.dueDateFrom));
  if (filters.dueDateTo) conditions.push(lte(tasks.dueDate, filters.dueDateTo));

  // Assignee filter requires a join/subquery against task_assignments.
  let assigneeSubquery: string[] | null = null;
  if (filters.assignee) {
    const assignedTaskIds = await db
      .select({ taskId: taskAssignments.taskId })
      .from(taskAssignments)
      .where(eq(taskAssignments.userId, filters.assignee));
    assigneeSubquery = assignedTaskIds.map((r) => r.taskId);
    if (assigneeSubquery.length === 0) {
      // No tasks assigned to this user - short-circuit to an empty page.
      return buildPaginatedResponse([], 0, pagination);
    }
    conditions.push(inArray(tasks.id, assigneeSubquery));
  }

  const whereClause = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(whereClause)
      .orderBy(desc(tasks.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(whereClause),
  ]);

  return buildPaginatedResponse(rows, count, pagination);
}

export async function createTask(
  orgId: string,
  projectId: string,
  userId: string,
  input: CreateTaskInput
) {
  await assertProjectInOrg(orgId, projectId);

  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      orgId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      createdBy: userId,
    })
    .returning();

  return task;
}

export async function getTask(orgId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId), isNull(tasks.deletedAt)))
    .limit(1);

  if (!task) {
    throw Errors.notFound("Task", "TASK_NOT_FOUND");
  }
  return task;
}

export async function updateTask(orgId: string, taskId: string, input: UpdateTaskInput) {
  await getTask(orgId, taskId);

  const [updated] = await db
    .update(tasks)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
    .returning();

  return updated;
}

export async function deleteTask(orgId: string, taskId: string) {
  await getTask(orgId, taskId);

  await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));
}

export async function bulkUpdateStatus(orgId: string, input: BulkStatusUpdateInput) {
  const result = await db
    .update(tasks)
    .set({ status: input.status, updatedAt: new Date() })
    .where(
      and(
        inArray(tasks.id, input.taskIds),
        eq(tasks.orgId, orgId),
        isNull(tasks.deletedAt)
      )
    )
    .returning({ id: tasks.id });

  return { updatedCount: result.length, updatedIds: result.map((r) => r.id) };
}

export async function searchTasks(
  orgId: string,
  q: string,
  pagination: { page?: number | string; limit?: number | string }
) {
  const params = parsePagination(pagination);

  const tsQuery = sql`websearch_to_tsquery('english', ${q})`;
  const whereClause = sql`${tasks.orgId} = ${orgId} AND ${tasks.deletedAt} IS NULL AND ${tasks.searchVector} @@ ${tsQuery}`;

  const rows = await db
    .select()
    .from(tasks)
    .where(whereClause)
    .limit(params.limit)
    .offset(params.offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(whereClause);

  return buildPaginatedResponse(rows, count, params);
}

/**
 * Verifies the target user is a member of the same org as the task
 * (required by the assignment: "The assigned user must belong to the
 * same organization as the task").
 */
async function assertUserInOrg(orgId: string, userId: string) {
  const [membership] = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw Errors.validation({
      userId: "Target user is not a member of this organization",
    });
  }
}

/**
 * Persists the assignment, then enqueues an async email-notification job
 * (Task 04) before returning - the request never waits on email delivery
 * itself, only on the enqueue call, which is a fast Redis round-trip.
 *
 * Consistency strategy for enqueue failure (per assignment requirement):
 * Postgres and Redis are two separate systems, so there's no single
 * transaction spanning both. We choose **fail-closed with a compensating
 * rollback**: if enqueueing the notification job throws, we delete the
 * assignment row we just inserted and return an error, so the client
 * sees a clean failure and can retry - there is never a persisted
 * assignment that silently never got a notification attempt. The
 * alternative (best-effort: keep the assignment, log the enqueue
 * failure, rely on a periodic reconciliation job to catch orphans) is
 * more resilient to transient Redis blips but adds real operational
 * complexity for a take-home scope; the compensating-rollback approach
 * is simpler to reason about and verify correctness of.
 */
export async function assignUser(
  orgId: string,
  taskId: string,
  targetUserId: string,
  assignedBy: string
) {
  const task = await getTask(orgId, taskId);
  await assertUserInOrg(orgId, targetUserId);

  const [existing] = await db
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .where(
      and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.userId, targetUserId))
    )
    .limit(1);

  if (existing) {
    throw new AppError(409, "ALREADY_ASSIGNED", "User is already assigned to this task");
  }

  const [assignment] = await db
    .insert(taskAssignments)
    .values({ taskId, userId: targetUserId, assignedBy })
    .returning();

  const [assignedUser] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  let notificationJobId: string | null = null;
  let deduped = false;
  try {
    const enqueueResult = await enqueueAssignmentEmail({
      assignmentId: assignment.id,
      taskId,
      taskTitle: task.title,
      orgId,
      assignedUserId: targetUserId,
      assignedUserEmail: assignedUser.email,
      assignedUserName: assignedUser.name,
      assignedByUserId: assignedBy,
    });
    notificationJobId = enqueueResult.jobId;
    deduped = enqueueResult.deduped;
  } catch (err) {
    // Compensating rollback - see strategy note above.
    await db.delete(taskAssignments).where(eq(taskAssignments.id, assignment.id));
    throw Errors.internal(
      "Failed to enqueue assignment notification; the assignment was not saved. Please retry."
    );
  }

  return { assignment, task, assignedUser, notificationJobId, deduped };
}

export async function unassignUser(orgId: string, taskId: string, targetUserId: string) {
  await getTask(orgId, taskId);

  const [deleted] = await db
    .delete(taskAssignments)
    .where(
      and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.userId, targetUserId))
    )
    .returning();

  if (!deleted) {
    throw Errors.notFound("Assignment", "ASSIGNMENT_NOT_FOUND");
  }
}

export async function listAssignments(orgId: string, taskId: string) {
  await getTask(orgId, taskId);

  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      assignedAt: taskAssignments.assignedAt,
    })
    .from(taskAssignments)
    .innerJoin(users, eq(taskAssignments.userId, users.id))
    .where(eq(taskAssignments.taskId, taskId));
}
