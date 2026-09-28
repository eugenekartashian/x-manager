import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, needsReencryption, parseKeyRing } from "./crypto";

const keyV1 = randomBytes(32).toString("base64");
const keyV2 = randomBytes(32).toString("base64");

describe("parseKeyRing", () => {
  it("parses versioned keys and the current version", () => {
    const ring = parseKeyRing(`v1:${keyV1}, v2:${keyV2}`, "v2");

    expect(ring.current).toBe("v2");
    expect([...ring.keys.keys()]).toEqual(["v1", "v2"]);
  });

  it("rejects keys of the wrong length", () => {
    expect(() => parseKeyRing(`v1:${randomBytes(16).toString("base64")}`, "v1")).toThrow("v1");
  });

  it("rejects a current version missing from the ring", () => {
    expect(() => parseKeyRing(`v1:${keyV1}`, "v2")).toThrow("v2");
  });

  it("never echoes key material in errors", () => {
    const bad = `v1:${randomBytes(8).toString("base64")}`;
    expect(() => parseKeyRing(bad, "v1")).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(bad.slice(3)) }),
    );
  });
});

describe("encrypt / decrypt", () => {
  const ring = parseKeyRing(`v1:${keyV1}`, "v1");

  it("round-trips and never contains the plaintext", () => {
    const payload = encrypt(ring, "secret-token", "ctx");

    expect(payload).not.toContain("secret-token");
    expect(payload.startsWith("v1:")).toBe(true);
    expect(decrypt(ring, payload, "ctx")).toBe("secret-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt(ring, "same", "ctx")).not.toBe(encrypt(ring, "same", "ctx"));
  });

  it("fails for a different context (ciphertext cannot be moved between rows)", () => {
    const payload = encrypt(ring, "secret-token", "x-account:ws-a:access");

    expect(() => decrypt(ring, payload, "x-account:ws-b:access")).toThrow();
  });

  it("fails when the ciphertext is tampered with", () => {
    const [version, iv, ciphertext, tag] = encrypt(ring, "secret-token", "ctx").split(":");
    const flipped = Buffer.from(ciphertext ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;

    expect(() =>
      decrypt(ring, [version, iv, flipped.toString("base64url"), tag].join(":"), "ctx"),
    ).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt(ring, "v1:only-two", "ctx")).toThrow("Malformed");
  });
});

describe("key rotation", () => {
  it("decrypts old payloads after rotation and flags them for re-encryption", () => {
    const oldRing = parseKeyRing(`v1:${keyV1}`, "v1");
    const rotated = parseKeyRing(`v1:${keyV1},v2:${keyV2}`, "v2");
    const oldPayload = encrypt(oldRing, "token", "ctx");

    expect(decrypt(rotated, oldPayload, "ctx")).toBe("token");
    expect(needsReencryption(rotated, oldPayload)).toBe(true);
    expect(needsReencryption(rotated, encrypt(rotated, "token", "ctx"))).toBe(false);
  });

  it("fails once the old key is removed from the ring", () => {
    const oldPayload = encrypt(parseKeyRing(`v1:${keyV1}`, "v1"), "token", "ctx");

    expect(() => decrypt(parseKeyRing(`v2:${keyV2}`, "v2"), oldPayload, "ctx")).toThrow("v1");
  });
});
