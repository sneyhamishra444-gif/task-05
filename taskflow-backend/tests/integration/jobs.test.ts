import request from "supertest";
import { Job } from "bullmq";
import { app, registerFixture } from "../helpers/testApp";
import { resetDb, closeDb } from "../helpers/db";
import { emailQueue } from "../../src/lib/queue";
import { redis } from "../../src/lib/redis";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await emailQueue.close();
  await redis.quit();
  await closeDb();
});

describe("Bonus: task assignment creates a queue job", () => {
  it("enqueues a real BullMQ job on assignment, retrievable via GET /jobs/:id", async () => {
    const owner = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const memberEmail = "jobtest-assignee@example.com";
    await request(app).post("/auth/register").send({
      email: memberEmail,
      password: "MemberPass123",
      name: "Job Test Assignee",
      organizationName: "Throwaway",
    });
    const addMemberRes = await request(app)
      .post(`/orgs/${owner.orgId}/members`)
      .set(auth)
      .send({ email: memberEmail, role: "member" });
    const assigneeId = addMemberRes.body.userId;

    const project = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "Job Test Project" });
    const task = await request(app)
      .post(`/orgs/${owner.orgId}/projects/${project.body.id}/tasks`)
      .set(auth)
      .send({ title: "Job Test Task" });

    const assignRes = await request(app)
      .post(`/orgs/${owner.orgId}/tasks/${task.body.id}/assignments`)
      .set(auth)
      .send({ userId: assigneeId });

    expect(assignRes.status).toBe(201);
    const jobId = assignRes.body.notificationJobId;
    expect(jobId).toBeTruthy();

    // Directly verify the job exists in BullMQ/Redis, independent of the
    // API layer, proving the enqueue genuinely happened.
    const job = await Job.fromId(emailQueue, jobId);
    expect(job).not.toBeNull();
    expect(job!.data.taskId).toBe(task.body.id);
    expect(job!.data.assignedUserId).toBe(assigneeId);
    expect(job!.data.assignedUserEmail).toBe(memberEmail);

    // And confirm it's reachable through the API too, with a valid status.
    const jobStatusRes = await request(app)
      .get(`/jobs/${jobId}`)
      .set(auth);
    expect(jobStatusRes.status).toBe(200);
    expect(["pending", "active", "completed"]).toContain(jobStatusRes.body.status);
  });

  it("returns 404 for an unknown job id and 403 for a job outside the caller's org", async () => {
    const owner = await registerFixture();
    const outsider = await registerFixture();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const notFoundRes = await request(app)
      .get("/jobs/email-assign-00000000-0000-0000-0000-000000000000")
      .set(auth);
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.code).toBe("JOB_NOT_FOUND");

    // Create a real job under `owner`'s org, then try to read it as `outsider`.
    const memberEmail = "jobtest-assignee2@example.com";
    await request(app).post("/auth/register").send({
      email: memberEmail,
      password: "MemberPass123",
      name: "Assignee2",
      organizationName: "Throwaway2",
    });
    const addMemberRes = await request(app)
      .post(`/orgs/${owner.orgId}/members`)
      .set(auth)
      .send({ email: memberEmail, role: "member" });
    const assigneeId = addMemberRes.body.userId;

    const project = await request(app)
      .post(`/orgs/${owner.orgId}/projects`)
      .set(auth)
      .send({ name: "P2" });
    const task = await request(app)
      .post(`/orgs/${owner.orgId}/projects/${project.body.id}/tasks`)
      .set(auth)
      .send({ title: "T2" });
    const assignRes = await request(app)
      .post(`/orgs/${owner.orgId}/tasks/${task.body.id}/assignments`)
      .set(auth)
      .send({ userId: assigneeId });

    const outsiderRes = await request(app)
      .get(`/jobs/${assignRes.body.notificationJobId}`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(outsiderRes.status).toBe(403);
  });
});
