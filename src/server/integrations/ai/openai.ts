import "server-only";
import OpenAI from "openai";
import {
  buildUserPrompt,
  OUTPUT_JSON_SCHEMA,
  parseIdeas,
  SYSTEM_PROMPT,
  type ReplyIdeasInput,
  type ReplyIdeasResult,
} from "./reply-ideas";

export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";

/** OpenAI Responses API (the key only needs "Responses: Write"). */
export async function openAiReplyIdeas(
  apiKey: string,
  model: string,
  input: ReplyIdeasInput,
): Promise<ReplyIdeasResult> {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });
  const response = await client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: buildUserPrompt(input),
    reasoning: { effort: "low" },
    max_output_tokens: 2_000,
    text: {
      format: {
        type: "json_schema",
        name: "reply_ideas",
        schema: { ...OUTPUT_JSON_SCHEMA },
        strict: true,
      },
    },
  });

  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
  if (refused) return { kind: "refused" };
  const usage = {
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
  const ideas = parseIdeas(response.output_text);
  return ideas ? { kind: "ok", ideas, ...usage } : { kind: "invalid", ...usage };
}
