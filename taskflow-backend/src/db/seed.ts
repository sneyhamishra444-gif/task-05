/**
 * Seed data per assignment spec:
 *   - 2 organizations
 *   - 5 users
 *   - multiple projects
 *   - 10+ tasks, distributed across projects, mixed statuses/priorities
 *   - assignments and sample comments
 *
 * Run with: npm run db:seed
 * Idempotent-ish: wipes and re-inserts (dev/test convenience only).
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import bcrypt from "bcrypt";
import * as schema from "./schema";
import {
  organizations,
  users,
  orgMembers,
  projects,
  tasks,
  taskAssignments,
  comments,
} from "./schema";

const BCRYPT_COST = parseInt(process.env.BCRYPT_COST_FACTOR || "12", 10);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log("Clearing existing data...");
  await db.delete(comments);
  await db.delete(taskAssignments);
  await db.delete(tasks);
  await db.delete(projects);
  await db.delete(orgMembers);
  await db.delete(organizations);
  await db.delete(users);

  console.log("Seeding organizations...");
  const [acme, globex] = await db
    .insert(organizations)
    .values([
      { name: "Acme Corp", slug: "acme-corp" },
      { name: "Globex Inc", slug: "globex-inc" },
    ])
    .returning();

  console.log("Seeding users...");
  const defaultPasswordHash = await bcrypt.hash("Password123!", BCRYPT_COST);

  const [alice, bob, carol, dave, erin] = await db
    .insert(users)
    .values([
      { email: "alice@acme.test", name: "Alice Admin", passwordHash: defaultPasswordHash },
      { email: "bob@acme.test", name: "Bob Builder", passwordHash: defaultPasswordHash },
      { email: "carol@acme.test", name: "Carol Coder", passwordHash: defaultPasswordHash },
      { email: "dave@globex.test", name: "Dave Director", passwordHash: defaultPasswordHash },
      { email: "erin@globex.test", name: "Erin Engineer", passwordHash: defaultPasswordHash },
    ])
    .returning();

  console.log("Seeding org memberships...");
  await db.insert(orgMembers).values([
    { orgId: acme.id, userId: alice.id, role: "org_admin" },
    { orgId: acme.id, userId: bob.id, role: "member" },
    { orgId: acme.id, userId: carol.id, role: "member" },
    { orgId: globex.id, userId: dave.id, role: "org_admin" },
    { orgId: globex.id, userId: erin.id, role: "member" },
  ]);

  console.log("Seeding projects...");
  const [website, mobileApp, dataMigration, marketingSite] = await db
    .insert(projects)
    .values([
      { orgId: acme.id, name: "Website Redesign", description: "Marketing site refresh", createdBy: alice.id },
      { orgId: acme.id, name: "Mobile App", description: "iOS/Android client", createdBy: alice.id },
      { orgId: globex.id, name: "Data Migration", description: "Legacy DB to Postgres", createdBy: dave.id },
      { orgId: globex.id, name: "Marketing Site", description: "New landing pages", createdBy: dave.id },
    ])
    .returning();

  console.log("Seeding tasks...");
  const taskRows = await db
    .insert(tasks)
    .values([
      // Website Redesign (Acme)
      { projectId: website.id, orgId: acme.id, title: "Set up design system", description: "Establish tokens, typography and color palette", status: "done", priority: "high", createdBy: alice.id },
      { projectId: website.id, orgId: acme.id, title: "Build homepage hero section", description: "Implement responsive hero with CTA", status: "in_progress", priority: "high", createdBy: alice.id, dueDate: new Date(Date.now() + 3 * 86400000) },
      { projectId: website.id, orgId: acme.id, title: "Write pricing page copy", description: "Draft and review pricing page content", status: "todo", priority: "medium", createdBy: bob.id, dueDate: new Date(Date.now() + 10 * 86400000) },
      { projectId: website.id, orgId: acme.id, title: "Fix mobile nav overlap bug", description: "Nav overlaps hero on small viewports", status: "review", priority: "urgent", createdBy: carol.id, dueDate: new Date(Date.now() + 1 * 86400000) },

      // Mobile App (Acme)
      { projectId: mobileApp.id, orgId: acme.id, title: "Implement push notifications", description: "Wire up FCM/APNs for task assignment alerts", status: "todo", priority: "high", createdBy: alice.id, dueDate: new Date(Date.now() + 14 * 86400000) },
      { projectId: mobileApp.id, orgId: acme.id, title: "Offline task caching", description: "Cache task list for offline viewing", status: "in_progress", priority: "medium", createdBy: bob.id },
      { projectId: mobileApp.id, orgId: acme.id, title: "App store submission checklist", description: "Prepare screenshots, metadata, review notes", status: "todo", priority: "low", createdBy: carol.id },

      // Data Migration (Globex)
      { projectId: dataMigration.id, orgId: globex.id, title: "Audit legacy schema", description: "Document existing MySQL schema and constraints", status: "done", priority: "high", createdBy: dave.id },
      { projectId: dataMigration.id, orgId: globex.id, title: "Write migration scripts", description: "ETL scripts from MySQL to PostgreSQL", status: "in_progress", priority: "urgent", createdBy: dave.id, dueDate: new Date(Date.now() + 5 * 86400000) },
      { projectId: dataMigration.id, orgId: globex.id, title: "Validate row counts post-migration", description: "Automated reconciliation report", status: "todo", priority: "high", createdBy: erin.id, dueDate: new Date(Date.now() + 12 * 86400000) },
      { projectId: dataMigration.id, orgId: globex.id, title: "Decommission legacy DB", description: "Shut down old instance after sign-off", status: "todo", priority: "low", createdBy: dave.id, dueDate: new Date(Date.now() + 30 * 86400000) },

      // Marketing Site (Globex)
      { projectId: marketingSite.id, orgId: globex.id, title: "Draft landing page wireframes", description: "Low-fidelity wireframes for review", status: "review", priority: "medium", createdBy: erin.id },
      { projectId: marketingSite.id, orgId: globex.id, title: "SEO audit", description: "Identify quick-win SEO improvements", status: "todo", priority: "low", createdBy: dave.id },
    ])
    .returning();

  console.log(`Seeded ${taskRows.length} tasks.`);

  const byTitle = (title: string) => taskRows.find((t) => t.title === title)!;

  console.log("Seeding task assignments...");
  await db.insert(taskAssignments).values([
    { taskId: byTitle("Build homepage hero section").id, userId: bob.id, assignedBy: alice.id },
    { taskId: byTitle("Write pricing page copy").id, userId: carol.id, assignedBy: alice.id },
    { taskId: byTitle("Fix mobile nav overlap bug").id, userId: bob.id, assignedBy: alice.id },
    { taskId: byTitle("Implement push notifications").id, userId: carol.id, assignedBy: alice.id },
    { taskId: byTitle("Write migration scripts").id, userId: erin.id, assignedBy: dave.id },
    { taskId: byTitle("Validate row counts post-migration").id, userId: erin.id, assignedBy: dave.id },
  ]);

  console.log("Seeding comments...");
  await db.insert(comments).values([
    { taskId: byTitle("Build homepage hero section").id, authorId: alice.id, content: "Let's use the new illustration set here." },
    { taskId: byTitle("Build homepage hero section").id, authorId: bob.id, content: "Sounds good, pulling assets from Figma now." },
    { taskId: byTitle("Fix mobile nav overlap bug").id, authorId: carol.id, content: "Repro'd on iPhone SE viewport, patch incoming." },
    { taskId: byTitle("Write migration scripts").id, authorId: erin.id, content: "Found 3 tables with non-standard timestamp formats, adjusting ETL." },
  ]);

  console.log("Seed complete.");
  console.log("Sample login: alice@acme.test / Password123!  (org_admin, Acme Corp)");
  console.log("Sample login: dave@globex.test / Password123!  (org_admin, Globex Inc)");

  await pool.end();
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
