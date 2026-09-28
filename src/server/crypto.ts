import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM with versioned keys. Payload: "<version>:<iv>:<ciphertext>:<tag>" (base64url).
// `context` is bound as additional authenticated data, so a ciphertext only
// decrypts for the purpose/row it was created for (e.g. "x-account:<workspaceId>:access").

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

export type KeyRing = { current: string; keys: ReadonlyMap<string, Buffer> };

export function parseKeyRing(rawKeys: string, current: string): KeyRing {
  const keys = new Map<string, Buffer>();
  for (const entry of rawKeys.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    const version = trimmed.slice(0, separator);
    const key = Buffer.from(trimmed.slice(separator + 1), "base64");
    if (separator <= 0 || !/^v\d+$/.test(version) || key.length !== KEY_BYTES) {
      throw new Error(
        `Invalid encryption key entry "${version || "?"}": expected v<N>:<base64 32 bytes>`,
      );
    }
    keys.set(version, key);
  }
  if (!keys.has(current)) {
    throw new Error(`Current encryption key version "${current}" is not in the key ring`);
  }
  return { current, keys };
}

export function encrypt(ring: KeyRing, plaintext: string, context: string): string {
  const key = requireKey(ring, ring.current);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ring.current, iv, ciphertext, tag]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
}

export function decrypt(ring: KeyRing, payload: string, context: string): string {
  const [version, iv, ciphertext, tag, ...rest] = payload.split(":");
  if (!version || !iv || !ciphertext || !tag || rest.length > 0) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    requireKey(ring, version),
    Buffer.from(iv, "base64url"),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  // Throws on a wrong key, tampered data or mismatched context.
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** True when the payload was encrypted with an older key and should be re-encrypted. */
export function needsReencryption(ring: KeyRing, payload: string): boolean {
  return payload.split(":", 1)[0] !== ring.current;
}

function requireKey(ring: KeyRing, version: string): Buffer {
  const key = ring.keys.get(version);
  if (!key) throw new Error(`Unknown encryption key version "${version}"`);
  return key;
}
