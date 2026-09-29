import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildUserPrompt,
  OUTPUT_JSON_SCHEMA,
  parseIdeas,
  SYSTEM_PROMPT,
  type ReplyIdeasInput,
  type ReplyIdeasResult,
} from "./reply-ideas";

export const CLAUDE_DEFAULT_MODEL = "claude-opus-5";

export async function claudeReplyIdeas(
  apiKey: string,
  model: string,
  input: ReplyIdeasInput,
): Promise<ReplyIdeasResult> {
  // A fresh client per call keeps configuration explicit and test-friendly.
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
  const response = await client.beta.messages.create({
    model,
    max_tokens: 2_000,
    // A policy refusal is retried server-side on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: { ...OUTPUT_JSON_SCHEMA } },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  if (response.stop_reason === "refusal") return { kind: "refused" };
  const usage = {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  const ideas = parseIdeas(text);
  return ideas ? { kind: "ok", ideas, ...usage } : { kind: "invalid", ...usage };
}
