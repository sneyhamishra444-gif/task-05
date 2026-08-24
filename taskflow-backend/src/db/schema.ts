/**
 * TaskFlow database schema (Drizzle ORM).
 *
 * Design notes / FK decisions (documented per assignment requirements):
 *
 * - org_members.org_id / user_id -> CASCADE
 *     Membership rows are pure join records; if a user or org is deleted,
 *     their memberships are meaningless and should disappear with them.
 *
 * - projects.org_id -> CASCADE
 *     A project cannot exist without its organization. Deleting an org is a
 *     deliberate destructive action (soft-delete is preferred in the API -
 *     see `deleted_at`), so a hard org delete cascades to its projects.
 *
 * - tasks.project_id -> CASCADE
 *     Tasks are owned by exactly one project and have no meaning outside it.
 *
 * - tasks.org_id -> RESTRICT (denormalized column, see below)
 *     We store org_id directly on tasks (in addition to deriving it via
 *     project_id -> projects.org_id) purely so that authorization checks
 *     ("does this task belong to the caller's org?") and query filters can
 *     be done with a single indexed column instead of a join on every
 *     request. It is kept in sync by application code inside the same
 *     transaction that creates the task. RESTRICT here is a safety net:
 *     org rows should never be hard-deleted while tasks still reference
 *     them directly.
 *
 * - task_assignments.task_id -> CASCADE
 *     Assignment rows have no meaning once the task is gone.
 *
 * - task_assignments.user_id -> CASCADE
 *     If a user account is removed, their assignments should not block
 *     deletion or dangle; the task simply becomes unassigned.
 *
 * - comments.task_id -> CASCADE
 *     Comments belong to a task; deleting the task removes its discussion.
 *
 * - comments.author_id (user_id) -> RESTRICT
 *     Comments are an audit trail of who said what. We deliberately do NOT
 *     cascade-delete a user's comments (which would rewrite history) nor
 *     SET NULL (which would hide authorship). Instead user deletion is
 *     blocked while authored comments exist; the application should offer
 *     an explicit "anonymize/deactivate user" flow instead of hard delete.
 *
 * - refresh_tokens.user_id -> CASCADE
 *     Tokens are meaningless without the user; deleting the user revokes
 *     all sessions implicitly.
 *
 * Indexing strategy (justified per assignment requirement):
 * - Every foreign key used in tenant-scoping WHERE clauses is indexed
 *   (org_id columns, project_id, task_id, user_id) because virtually
 *   every query in a multi-tenant system filters by these.
 * - tasks.status / tasks.priority are indexed because the required task
 *   filters (status, priority, assignee, due-date range) are the primary
 *   access pattern for the task list endpoint.
 * - tasks.due_date is indexed to support the due-date range filter and
 *   any "upcoming/overdue" dashboard queries.
 * - projects.deleted_at / tasks.deleted_at are indexed (partial-style via
 *   plain btree, filtered in queries with `deleted_at IS NULL`) to keep
 *   "active rows" scans cheap despite soft deletes.
 * - A GIN index over a generated tsvector (title || description) powers
 *   full-text search on tasks (bonus requirement). See migration SQL for
 *   the trigger/generated column, since Drizzle's pgTable doesn't model
 *   tsvector natively - handled via `customType` below.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "review",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const orgRoleEnum = pgEnum("org_role", ["org_admin", "member"]);

// tsvector custom type (Drizzle has no first-class tsvector column type)
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Login is always by email - unique + indexed.
  emailUniqueIdx: uniqueIndex("users_email_unique_idx").on(table.email),
}));

// ---------------------------------------------------------------------------
// organizations
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  slugUniqueIdx: uniqueIndex("organizations_slug_unique_idx").on(table.slug),
}));

// ---------------------------------------------------------------------------
// org_members  (join table: users <-> organizations, with role)
// ---------------------------------------------------------------------------

export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: orgRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // A user can only belong to an org once.
  orgUserUniqueIdx: uniqueIndex("org_members_org_user_unique_idx").on(
    table.orgId,
    table.userId
  ),
  // Every "list members of org" / "find memberships for user" query hits
  // one of these.
  orgIdIdx: index("org_members_org_id_idx").on(table.orgId),
  userIdIdx: index("org_members_user_id_idx").on(table.userId),
}));

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Bonus: soft delete
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  // Every project listing/dashboard query scopes by org first.
  orgIdIdx: index("projects_org_id_idx").on(table.orgId),
  // Lets `WHERE deleted_at IS NULL` scans stay cheap on large tables.
  deletedAtIdx: index("projects_deleted_at_idx").on(table.deletedAt),
}));

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  // Denormalized for fast tenant-scoped queries/authorization checks
  // without an extra join - see file header notes.
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Bonus: soft delete
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Bonus: full-text search over title + description. Populated/maintained
  // by a DB trigger defined in the raw migration SQL (0002_fulltext_search).
  searchVector: tsvector("search_vector"),
}, (table) => ({
  projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
  orgIdIdx: index("tasks_org_id_idx").on(table.orgId),
  // Powers the required status/priority filters directly.
  statusIdx: index("tasks_status_idx").on(table.status),
  priorityIdx: index("tasks_priority_idx").on(table.priority),
  // Powers the required due-date range filter.
  dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
  deletedAtIdx: index("tasks_deleted_at_idx").on(table.deletedAt),
  // Composite index: the single most common query shape is
  // "tasks in project X that are not deleted", so a composite beats two
  // single-column indexes for that specific access pattern.
  projectNotDeletedIdx: index("tasks_project_deleted_idx").on(
    table.projectId,
    table.deletedAt
  ),
}));

// ---------------------------------------------------------------------------
// task_assignments
// ---------------------------------------------------------------------------

export const taskAssignments = pgTable("task_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id, {
    onDelete: "set null",
  }),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // A given user can only be assigned to a given task once at a time
  // (unassign deletes the row, see task.service.ts).
  taskUserUniqueIdx: uniqueIndex("task_assignments_task_user_unique_idx").on(
    table.taskId,
    table.userId
  ),
  taskIdIdx: index("task_assignments_task_id_idx").on(table.taskId),
  // Powers "my tasks" / assignee filter.
  userIdIdx: index("task_assignments_user_id_idx").on(table.userId),
}));

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Loading a task's comment thread is the only real access pattern.
  taskIdIdx: index("comments_task_id_idx").on(table.taskId),
}));

// ---------------------------------------------------------------------------
// refresh_tokens  (Task 02, but co-located here since it's a core table)
// ---------------------------------------------------------------------------

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // We never store the raw refresh token, only a SHA-256 hash of it, so a
  // DB leak alone can't be used to forge sessions.
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  // Bonus: rotation - points at the token that replaced this one.
  replacedByTokenId: uuid("replaced_by_token_id"),
  createdByIp: varchar("created_by_ip", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // Refresh + logout endpoints look tokens up by hash constantly.
  tokenHashIdx: uniqueIndex("refresh_tokens_token_hash_idx").on(
    table.tokenHash
  ),
  // "Logout all devices" revokes every token for a user.
  userIdIdx: index("refresh_tokens_user_id_idx").on(table.userId),
}));

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(orgMembers),
  taskAssignments: many(taskAssignments),
  comments: many(comments),
  refreshTokens: many(refreshTokens),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  projects: many(projects),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  organization: one(organizations, {
    fields: [tasks.orgId],
    references: [organizations.id],
  }),
  assignments: many(taskAssignments),
  comments: many(comments),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAssignments.userId],
    references: [users.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
