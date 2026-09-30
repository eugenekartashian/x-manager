import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://user@localhost:5432/db",
  APP_URL: "http://127.0.0.1:3000",
  AUTH_SECRET: "x".repeat(32),
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
  SUPERADMIN_EMAILS: "Me@Gmail.com, friend@example.com",
  X_CLIENT_ID: "x-client-id",
  X_CLIENT_SECRET: "x-client-secret",
  X_REDIRECT_URI: "http://127.0.0.1:3000/api/x/oauth/callback",
  TOKEN_ENCRYPTION_KEYS: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  TOKEN_ENCRYPTION_CURRENT: "v1",
  CRON_SECRET: "c".repeat(32),
};

describe("parseServerEnv", () => {
  it("parses a valid environment, defaulting NODE_ENV and normalizing the allowlist", () => {
    const env = parseServerEnv(validEnv);

    expect(env.NODE_ENV).toBe("development");
    expect(env.X_WRITES_ENABLED).toBe(false);
    expect(env.SUPERADMIN_EMAILS).toEqual(["me@gmail.com", "friend@example.com"]);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({ ...validEnv, DATABASE_URL: undefined })).toThrow("DATABASE_URL");
  });

  it("rejects a non-postgres URL", () => {
    expect(() => parseServerEnv({ ...validEnv, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      "DATABASE_URL",
    );
  });

  it("rejects an empty or invalid allowlist", () => {
    expect(() => parseServerEnv({ ...validEnv, SUPERADMIN_EMAILS: " , " })).toThrow(
      "SUPERADMIN_EMAILS",
    );
    expect(() => parseServerEnv({ ...validEnv, SUPERADMIN_EMAILS: "not-an-email" })).toThrow(
      "SUPERADMIN_EMAILS",
    );
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseServerEnv({ ...validEnv, AUTH_SECRET: "short" })).toThrow("AUTH_SECRET");
  });

  it("never includes variable values in the error message", () => {
    const secret = "short-secret-value";

    expect(() => parseServerEnv({ ...validEnv, AUTH_SECRET: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
