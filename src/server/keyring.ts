import "server-only";
import { env } from "@/lib/env";
import { parseKeyRing } from "@/server/crypto";

// Validated at startup: a bad key configuration fails fast instead of at first use.
export const keyRing = parseKeyRing(env.TOKEN_ENCRYPTION_KEYS, env.TOKEN_ENCRYPTION_CURRENT);
