import request from "supertest";
import { createApp } from "../../src/app";

export const app = createApp();

interface RegisteredFixture {
  accessToken: string;
  refreshToken: string;
  userId: string;
  orgId: string;
  email: string;
}

let counter = 0;

/** Registers a fresh user + org and returns tokens/ids for use in a test. */
export async function registerFixture(
  overrides: Partial<{ email: string; password: string; name: string; organizationName: string }> = {}
): Promise<RegisteredFixture> {
  counter += 1;
  const email = overrides.email ?? `fixture${counter}-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({
      email,
      password: overrides.password ?? "FixturePass123",
      name: overrides.name ?? "Fixture User",
      organizationName: overrides.organizationName ?? `Fixture Org ${counter}`,
    });

  if (res.status !== 201) {
    throw new Error(`registerFixture failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    userId: res.body.user.id,
    orgId: res.body.organization.id,
    email,
  };
}
