import { hashPassword, verifyPassword } from "../../src/utils/password";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from "../../src/utils/jwt";

describe("password hashing (bcrypt)", () => {
  it("hashes a password and verifies the correct password against it", async () => {
    const hash = await hashPassword("CorrectHorseBattery1");
    expect(hash).not.toBe("CorrectHorseBattery1");
    expect(hash.startsWith("$2b$")).toBe(true);

    const ok = await verifyPassword("CorrectHorseBattery1", hash);
    expect(ok).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectHorseBattery1");
    const ok = await verifyPassword("WrongPassword", hash);
    expect(ok).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const hash1 = await hashPassword("SamePassword123");
    const hash2 = await hashPassword("SamePassword123");
    expect(hash1).not.toBe(hash2);
  });
});

describe("JWT access tokens", () => {
  it("signs and verifies round-trip, embedding the user id", () => {
    const token = signAccessToken("user-123");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.type).toBe("access");
  });

  it("throws on a tampered token", () => {
    const token = signAccessToken("user-123");
    const tampered = token.slice(0, -2) + "xx";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("throws on a garbage token", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow();
  });
});

describe("JWT refresh tokens", () => {
  it("signs and verifies round-trip, embedding user id and jti", () => {
    const token = signRefreshToken("user-123", "row-abc");
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.jti).toBe("row-abc");
    expect(payload.type).toBe("refresh");
  });

  it("rejects an access token presented as a refresh token", () => {
    const accessToken = signAccessToken("user-123");
    // Different secret entirely, so this should fail verification outright.
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});

describe("hashToken", () => {
  it("is deterministic (same input -> same hash)", () => {
    expect(hashToken("some-refresh-token")).toBe(hashToken("some-refresh-token"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("never returns the raw input", () => {
    expect(hashToken("some-refresh-token")).not.toBe("some-refresh-token");
  });
});
