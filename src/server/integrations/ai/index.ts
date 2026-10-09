import "server-only";
import { env } from "@/lib/env";
import { CLAUDE_DEFAULT_MODEL, claudeJsonTask } from "./claude";
import {
  buildMessageUserPrompt,
  MESSAGE_SYSTEM_PROMPT,
  parseMessages,
  type MessageIdeasInput,
} from "./collab-messages";
import { OPENAI_DEFAULT_MODEL, openAiJsonTask } from "./openai";
import {
  buildUserPrompt,
  OUTPUT_JSON_SCHEMA,
  parseIdeas,
  SYSTEM_PROMPT,
  type ReplyIdeasInput,
  type ReplyIdeasResult,
} from "./reply-ideas";
import type { JsonTask, JsonTaskResult } from "./task";

// Thin provider seam (PRD §7): AI_PROVIDER picks the vendor, AI_MODEL the model.

function config(): { apiKey: string | undefined; model: string; run: typeof claudeJsonTask } {
  return env.AI_PROVIDER === "openai"
    ? {
        apiKey: env.OPENAI_API_KEY,
        model: env.AI_MODEL ?? OPENAI_DEFAULT_MODEL,
        run: openAiJsonTask,
      }
    : {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.AI_MODEL ?? CLAUDE_DEFAULT_MODEL,
        run: claudeJsonTask,
      };
}

export function aiConfigured(): boolean {
  return Boolean(config().apiKey);
}

async function runTask(task: JsonTask): Promise<JsonTaskResult> {
  const { apiKey, model, run } = config();
  if (!apiKey) throw new Error(`API key for AI provider "${env.AI_PROVIDER}" is not configured`);
  return run(apiKey, model, task);
}

/** Validated text list or a typed failure — never unvalidated model output. */
async function runListTask(
  task: JsonTask,
  parse: (text: string) => string[] | null,
): Promise<ReplyIdeasResult> {
  const result = await runTask(task);
  if (result.kind === "refused") return result;
  const usage = {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
  const ideas = parse(result.text);
  return ideas ? { kind: "ok", ideas, ...usage } : { kind: "invalid", ...usage };
}

export function suggestReplyIdeas(input: ReplyIdeasInput): Promise<ReplyIdeasResult> {
  return runListTask(
    {
      name: "reply_ideas",
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(input),
      schema: OUTPUT_JSON_SCHEMA,
    },
    parseIdeas,
  );
}

/** Personal collaboration DM drafts (M7.2) — drafts only; the user sends them in X. */
export function suggestCollabMessages(input: MessageIdeasInput): Promise<ReplyIdeasResult> {
  return runListTask(
    {
      name: "collab_messages",
      system: MESSAGE_SYSTEM_PROMPT,
      user: buildMessageUserPrompt(input),
      schema: {
        type: "object",
        properties: { messages: { type: "array", items: { type: "string" } } },
        required: ["messages"],
        additionalProperties: false,
      },
    },
    parseMessages,
  );
}
