import request from "supertest";
import { app, registerFixture } from "../helpers/testApp";
import { resetDb, closeDb } from "../helpers/db";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("Validation & error response shape", () => {
  it("returns { error, code, details } for a Zod validation failure", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "not-an-email",
      password: "short",
      name: "",
      organizationName: "",
    });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
        code: "VALIDATION_ERROR",
        details: expect.any(Object),
      })
    );
  });

  it("returns a 404 with the resource-specific code for a missing project", async () => {
    const owner = await registerFixture();
    const res = await request(app)
      .get(`/orgs/${owner.orgId}/projects/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with a clear code for a missing Authorization header", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for a malformed access token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown route", async () => {
    const res = await request(app).get("/this-route-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ROUTE_NOT_FOUND");
  });

  it("rejects an invalid status value on task update with a validation error", async () => {
    const owner = await registerFixture();
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
      .patch(`/orgs/${owner.orgId}/tasks/${task.body.id}`)
      .set(auth)
      .send({ status: "not-a-real-status" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});
