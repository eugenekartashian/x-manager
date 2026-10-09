// A single structured-output request, independent of the vendor (D-021): system prompt,
// user content (untrusted data inside tags) and a JSON schema. Providers return raw text;
// each feature validates it with its own Zod schema.

export type JsonTask = {
  name: string; // schema name, e.g. "reply_ideas"
  system: string;
  user: string;
  schema: Record<string, unknown>;
};

export type JsonTaskResult =
  | { kind: "ok"; text: string; model: string; inputTokens: number; outputTokens: number }
  | { kind: "refused" };
