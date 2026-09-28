// Expected failures are values, not exceptions.
export type Result<T, E extends string = string> = { ok: true; data: T } | { ok: false; error: E };

export const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });
export const err = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });
