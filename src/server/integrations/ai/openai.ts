import "server-only";
import OpenAI from "openai";
import type { JsonTask, JsonTaskResult } from "./task";

export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";

/** OpenAI Responses API with strict JSON output (the key only needs "Responses: Write"). */
export async function openAiJsonTask(
  apiKey: string,
  model: string,
  task: JsonTask,
): Promise<JsonTaskResult> {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });
  const response = await client.responses.create({
    model,
    instructions: task.system,
    input: task.user,
    reasoning: { effort: "low" },
    max_output_tokens: 2_000,
    text: {
      format: { type: "json_schema", name: task.name, schema: { ...task.schema }, strict: true },
    },
  });

  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
  if (refused) return { kind: "refused" };
  return {
    kind: "ok",
    text: response.output_text,
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
