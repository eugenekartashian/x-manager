import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { JsonTask, JsonTaskResult } from "./task";

export const CLAUDE_DEFAULT_MODEL = "claude-opus-5";

export async function claudeJsonTask(
  apiKey: string,
  model: string,
  task: JsonTask,
): Promise<JsonTaskResult> {
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
      format: { type: "json_schema", schema: { ...task.schema } },
    },
    system: task.system,
    messages: [{ role: "user", content: task.user }],
  });

  if (response.stop_reason === "refusal") return { kind: "refused" };
  return {
    kind: "ok",
    text: response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(""),
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
