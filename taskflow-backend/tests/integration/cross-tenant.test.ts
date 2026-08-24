import request from "supertest";
import { app, registerFixture } from "../helpers/testApp";
import { resetDb, closeDb } from "../helpers/db";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("Cross-tenant isolation", () => {
  it("returns 403 when a user from Org B addresses Org A's orgId directly", async () => {
    const orgA = await registerFixture();
    const orgB = await registerFixture();

    const res = await request(app)
      .get(`/orgs/${orgA.orgId}/members`)
      .set("Authorization", `Bearer ${orgB.accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("returns 403 for Org B trying to list Org A's projects", async () => {
    const orgA = await registerFixture();
    const orgB = await registerFixture();

    const res = await request(app)
      .get(`/orgs/${orgA.orgId}/projects`)
      .set("Authorization", `Bearer ${orgB.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("does not leak an Org A task to Org B even under Org B's own orgId", async () => {
    const orgA = await registerFixture();
    const orgB = await registerFixture();
    const authA = { Authorization: `Bearer ${orgA.accessToken}` };

    const project = await request(app)
      .post(`/orgs/${orgA.orgId}/projects`)
      .set(authA)
      .send({ name: "Secret Project" });
    const task = await request(app)
      .post(`/orgs/${orgA.orgId}/projects/${project.body.id}/tasks`)
      .set(authA)
      .send({ title: "Secret Task" });

    // Org B queries using its OWN orgId (the only one it's a member of),
    // but Org A's task id. Should be a clean 404, not a leak of the task.
    const res = await request(app)
      .get(`/orgs/${orgB.orgId}/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${orgB.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty("title");
  });

  it("blocks a non-admin member from admin-only member-management actions", async () => {
    const owner = await registerFixture();
    const authOwner = { Authorization: `Bearer ${owner.accessToken}` };

    const memberEmail = "plainmember@example.com";
    await request(app).post("/auth/register").send({
      email: memberEmail,
      password: "MemberPass123",
      name: "Plain Member",
      organizationName: "Throwaway",
    });
    await request(app)
      .post(`/orgs/${owner.orgId}/members`)
      .set(authOwner)
      .send({ email: memberEmail, role: "member" });

    const memberLogin = await request(app)
      .post("/auth/login")
      .send({ email: memberEmail, password: "MemberPass123" });
    const memberAuth = { Authorization: `Bearer ${memberLogin.body.accessToken}` };

    const res = await request(app)
      .post(`/orgs/${owner.orgId}/members`)
      .set(memberAuth)
      .send({ email: "someone-else@example.com", role: "member" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});
