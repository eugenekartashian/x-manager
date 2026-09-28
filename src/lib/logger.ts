// Structured, minimal logging. Never pass tokens, secrets or raw API bodies.
type Fields = Record<string, string | number | boolean | null | undefined>;

export const logger = {
  info: (event: string, fields: Fields = {}) =>
    console.info(JSON.stringify({ level: "info", event, ...fields })),
  warn: (event: string, fields: Fields = {}) =>
    console.warn(JSON.stringify({ level: "warn", event, ...fields })),
  error: (event: string, fields: Fields = {}) =>
    console.error(JSON.stringify({ level: "error", event, ...fields })),
};
