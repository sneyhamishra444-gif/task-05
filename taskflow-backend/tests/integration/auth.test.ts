import request from "supertest";
import { app, registerFixture } from "../helpers/testApp";
import { resetDb, closeDb } from "../helpers/db";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("Auth: register -> login flow", () => {
  it("registers a new user + org and returns tokens", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "newuser@example.com",
      password: "GoodPassword123",
      name: "New User",
      organizationName: "New User Org",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("newuser@example.com");
    expect(res.body.organization.role).toBe("org_admin");
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
  });

  it("rejects duplicate email registration", async () => {
    await registerFixture({ email: "dupe@example.com" });
    const res = await request(app).post("/auth/register").send({
      email: "dupe@example.com",
      password: "AnotherPass123",
      name: "Dupe",
      organizationName: "Dupe Org",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("logs in with correct credentials", async () => {
    await registerFixture({ email: "logintest@example.com", password: "LoginPass123" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "logintest@example.com", password: "LoginPass123" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("logintest@example.com");
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("rejects login with wrong password", async () => {
    await registerFixture({ email: "wrongpw@example.com", password: "RightPass123" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "wrongpw@example.com", password: "WrongPass123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects login for a nonexistent email with the same error as wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "doesnotexist@example.com", password: "Whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("allows an authenticated request to /auth/me with the returned access token", async () => {
    const fixture = await registerFixture();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(fixture.userId);
  });

  it("rejects /auth/me with no token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("Auth: refresh token rotation", () => {
  it("rotates the refresh token on use and rejects reuse of the old one", async () => {
    const fixture = await registerFixture();

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: fixture.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refreshToken).not.toBe(fixture.refreshToken);

    const reuseRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: fixture.refreshToken });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("Auth: logout", () => {
  it("revokes the refresh token so it can no longer be used", async () => {
    const fixture = await registerFixture();

    const logoutRes = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: fixture.refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: fixture.refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
