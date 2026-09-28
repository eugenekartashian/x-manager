import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts a valid postgres URL and defaults NODE_ENV", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgresql://user@localhost:5432/db" });

    expect(env).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user@localhost:5432/db",
    });
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow("DATABASE_URL");
  });

  it("rejects a non-postgres URL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrow("DATABASE_URL");
  });

  it("never includes variable values in the error message", () => {
    const secret = "postgresql//no-colon-secret-value";

    expect(() => parseServerEnv({ DATABASE_URL: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
