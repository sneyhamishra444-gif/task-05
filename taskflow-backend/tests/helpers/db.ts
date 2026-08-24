import { db, pool } from "../../src/db/client";
import { sql } from "drizzle-orm";

/**
 * Test isolation strategy: a dedicated database (taskflow_test, created
 * and migrated once in tests/globalSetup.js) plus a full truncate of
 * every app table before each test. Simpler and more robust across an
 * Express app's own connection pool than per-test transaction rollback
 * (which would require every route handler to reuse a single shared
 * transaction - not how the app is structured), and fast enough at this
 * schema size to run before every test without slowing the suite down.
 */
export async function resetDb() {
  await db.execute(sql`
    TRUNCATE TABLE
      comments,
      task_assignments,
      tasks,
      projects,
      refresh_tokens,
      org_members,
      organizations,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function closeDb() {
  await pool.end();
}
