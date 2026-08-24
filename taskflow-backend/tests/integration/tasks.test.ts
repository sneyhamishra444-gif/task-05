import request from "supertest";
import { app, registerFixture } from "../helpers/testApp";
import { resetDb, closeDb } from "../helpers/db";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("Projects & Tasks: CRUD", () => {
  it("creates a project, then creates/lists/updates/deletes a task within it", async () => {
    const owner = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const projectRes = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "Integration Test Project", description: "desc" });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.id;

    const createTaskRes = await request(app)
      .post(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth)
      .send({ title: "First task", priority: "high", status: "todo" });
    expect(createTaskRes.status).toBe(201);
    expect(createTaskRes.body.title).toBe("First task");
    const taskId = createTaskRes.body.id;

    const listRes = await request(app)
      .get(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth);
    expect(listRes.status).toBe(200);
    // Required pagination response shape.
    expect(listRes.body).toEqual(
      expect.objectContaining({ total: 1, page: 1, limit: 20 })
    );
    expect(listRes.body.data).toHaveLength(1);

    const updateRes = await request(app)
      .patch(`/orgs/${owner.orgId}/tasks/${taskId}`)
      .set(auth)
      .send({ status: "in_progress" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe("in_progress");

    const deleteRes = await request(app)
      .delete(`/orgs/${owner.orgId}/tasks/${taskId}`)
      .set(auth);
    expect(deleteRes.status).toBe(204);

    const getDeletedRes = await request(app)
      .get(`/orgs/${owner.orgId}/tasks/${taskId}`)
      .set(auth);
    expect(getDeletedRes.status).toBe(404);
    expect(getDeletedRes.body.code).toBe("TASK_NOT_FOUND");
  });

  it("filters tasks by status and priority", async () => {
    const owner = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const project = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "Filter Project" });
    const projectId = project.body.id;

    await request(app)
      .post(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth)
      .send({ title: "Urgent todo", status: "todo", priority: "urgent" });
    await request(app)
      .post(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth)
      .send({ title: "Low done", status: "done", priority: "low" });

    const statusFiltered = await request(app)
      .get(`/orgs/${owner.orgId}/projects/${projectId}/tasks?status=done`)
      .set(auth);
    expect(statusFiltered.body.data).toHaveLength(1);
    expect(statusFiltered.body.data[0].title).toBe("Low done");

    const priorityFiltered = await request(app)
      .get(`/orgs/${owner.orgId}/projects/${projectId}/tasks?priority=urgent`)
      .set(auth);
    expect(priorityFiltered.body.data).toHaveLength(1);
    expect(priorityFiltered.body.data[0].title).toBe("Urgent todo");
  });

  it("returns a project dashboard with correct per-status counts", async () => {
    const owner = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const project = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "Dashboard Project" });
    const projectId = project.body.id;

    await request(app)
      .post(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth)
      .send({ title: "T1", status: "todo" });
    await request(app)
      .post(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth)
      .send({ title: "T2", status: "todo" });
    await request(app)
      .post(`/orgs/${owner.orgId}/projects/${projectId}/tasks`)
      .set(auth)
      .send({ title: "T3", status: "done" });

    const dashboardRes = await request(app)
      .get(`/orgs/${owner.orgId}/projects/${projectId}/dashboard`)
      .set(auth);

    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.total).toBe(3);
    expect(dashboardRes.body.byStatus).toEqual({
      todo: 2,
      in_progress: 0,
      review: 0,
      done: 1,
    });
  });
});

describe("Task assignment", () => {
  it("assigns a user who belongs to the org, and rejects a duplicate assignment", async () => {
    const owner = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    // Add a second member to the same org so there's a valid assignee.
    const memberEmail = "assignee@example.com";
    await request(app).post("/auth/register").send({
      email: memberEmail,
      password: "MemberPass123",
      name: "Assignee",
      organizationName: "Throwaway",
    });
    const addMemberRes = await request(app)
      .post(`/orgs/${owner.orgId}/members`)
      .set(auth)
      .send({ email: memberEmail, role: "member" });
    expect(addMemberRes.status).toBe(201);
    const assigneeId = addMemberRes.body.userId;

    const project = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "Assignment Project" });
    const task = await request(app)
      .post(`/orgs/${owner.orgId}/projects/${project.body.id}/tasks`)
      .set(auth)
      .send({ title: "Assign me" });
    const taskId = task.body.id;

    const assignRes = await request(app)
      .post(`/orgs/${owner.orgId}/tasks/${taskId}/assignments`)
      .set(auth)
      .send({ userId: assigneeId });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.assignment.userId).toBe(assigneeId);
    expect(assignRes.body.notificationJobId).toBeTruthy();

    const dupRes = await request(app)
      .post(`/orgs/${owner.orgId}/tasks/${taskId}/assignments`)
      .set(auth)
      .send({ userId: assigneeId });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.code).toBe("ALREADY_ASSIGNED");
  });

  it("rejects assigning a user who is not a member of the org", async () => {
    const owner = await registerFixture();
    const outsider = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const project = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "P" });
    const task = await request(app)
      .post(`/orgs/${owner.orgId}/projects/${project.body.id}/tasks`)
      .set(auth)
      .send({ title: "T" });

    const res = await request(app)
      .post(`/orgs/${owner.orgId}/tasks/${task.body.id}/assignments`)
      .set(auth)
      .send({ userId: outsider.userId });

    expect(res.status).toBe(422);
  });
});
