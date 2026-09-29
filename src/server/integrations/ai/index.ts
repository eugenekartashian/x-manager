import "server-only";
import { env } from "@/lib/env";
import { CLAUDE_DEFAULT_MODEL, claudeReplyIdeas } from "./claude";
import { OPENAI_DEFAULT_MODEL, openAiReplyIdeas } from "./openai";
import type { ReplyIdeasInput, ReplyIdeasResult } from "./reply-ideas";

// Thin provider seam (PRD §7): AI_PROVIDER picks the vendor, AI_MODEL the model.

function config(): { apiKey: string | undefined; model: string; run: typeof claudeReplyIdeas } {
  return env.AI_PROVIDER === "openai"
    ? {
        apiKey: env.OPENAI_API_KEY,
        model: env.AI_MODEL ?? OPENAI_DEFAULT_MODEL,
        run: openAiReplyIdeas,
      }
    : {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.AI_MODEL ?? CLAUDE_DEFAULT_MODEL,
        run: claudeReplyIdeas,
      };
}

export function aiConfigured(): boolean {
  return Boolean(config().apiKey);
}

export async function suggestReplyIdeas(input: ReplyIdeasInput): Promise<ReplyIdeasResult> {
  const { apiKey, model, run } = config();
  if (!apiKey) throw new Error(`API key for AI provider "${env.AI_PROVIDER}" is not configured`);
  return run(apiKey, model, input);
}
