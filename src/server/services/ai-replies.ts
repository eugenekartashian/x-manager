import "server-only";
import { err, ok, type Result } from "@/lib/result";
import { aiCostMicros } from "@/server/integrations/ai/pricing";
import { aiConfigured, suggestReplyIdeas } from "@/server/integrations/ai/claude";
import * as replies from "@/server/repositories/replies";
import { countUsageSince, recordUsage } from "@/server/repositories/usage";
import { canSpend } from "@/server/services/budget";

// AI reply ideas (M3.4): drafts only — the user edits and posts on x.com.

export const AI_OPERATION = "aiReplyIdeas";
/** Safety valve on top of the monthly budget. */
export const AI_DAILY_LIMIT = 100;
/** Upper estimate per request for the budget check (short prompt, low effort). */
const AI_ESTIMATE_MICROS = 20_000;

export type AiIdeasError =
  | "ai_not_configured"
  | "not_found"
  | "budget_exceeded"
  | "ai_daily_limit"
  | "ai_declined"
  | "ai_unavailable";

export function isAiEnabled(): boolean {
  return aiConfigured();
}

export async function suggestIdeasForPost(
  workspaceId: string,
  input: { targetId: string; xPostId: string },
  now: Date = new Date(),
): Promise<Result<string[], AiIdeasError>> {
  if (!aiConfigured()) return err("ai_not_configured");
  const target = await replies.findTarget(workspaceId, input.targetId);
  if (!target) return err("not_found");
  const post = await replies.findTargetPost(workspaceId, target.id, input.xPostId);
  if (!post) return err("not_found");

  if (!(await canSpend(workspaceId, AI_ESTIMATE_MICROS, now))) return err("budget_exceeded");
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if ((await countUsageSince(workspaceId, AI_OPERATION, dayStart)) >= AI_DAILY_LIMIT) {
    return err("ai_daily_limit");
  }

  const templates = await replies.listTemplates(workspaceId);
  let result;
  try {
    result = await suggestReplyIdeas({
      postText: post.text,
      authorName: target.name,
      authorBio: target.bio,
      note: target.note,
      styleExamples: templates.map((template) => template.text),
    });
  } catch {
    return err("ai_unavailable");
  }
  if (result.kind === "refused") return err("ai_declined");

  await recordUsage({
    workspaceId,
    provider: "AI",
    operation: AI_OPERATION,
    units: 1,
    unitPriceMicros: aiCostMicros(result.model, result.inputTokens, result.outputTokens),
    now,
  });
  return result.kind === "ok" ? ok(result.ideas) : err("ai_unavailable");
}
