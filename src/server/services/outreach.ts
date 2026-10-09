import "server-only";
import { z } from "zod";
import type { CreatorEvent, CreatorStatus, Workspace } from "@/generated/prisma/client";
import { parsePostUrl } from "@/lib/post-url";
import { err, ok, type Result } from "@/lib/result";
import { localDateOf, zonedToUtc } from "@/lib/zoned-time";
import {
  dmIntentUrl,
  MAX_MESSAGE_LENGTH,
  MESSAGE_UNDO_WINDOW_MS,
  statusAfterMessage,
} from "@/server/domain/outreach-rules";
import { aiConfigured, suggestCollabMessages } from "@/server/integrations/ai";
import { aiCostMicros } from "@/server/integrations/ai/pricing";
import * as outreach from "@/server/repositories/outreach";
import * as replies from "@/server/repositories/replies";
import { recordUsage } from "@/server/repositories/usage";
import { canSpend } from "@/server/services/budget";
import { CREATOR_STATUSES } from "@/server/services/creators";
import { getLimitsContext, recordFeatureUsage, usedToday } from "@/server/services/limits";

// Collab outreach (M7.2, D-033): drafts, "Open in X" (the user sends the DM), history and a
// per-day message limit. Nothing here sends anything to X.

type WorkspaceRef = Pick<Workspace, "id" | "name" | "timezone" | "limitMessagesPerDay">;

function startOfLocalDay(now: Date, timeZone: string): Date {
  return zonedToUtc(localDateOf(now, timeZone), "00:00", timeZone);
}

export async function messagesToday(workspace: WorkspaceRef, now: Date = new Date()) {
  const used = await outreach.countMessagesOpenedSince(
    workspace.id,
    startOfLocalDay(now, workspace.timezone),
  );
  return { used, limit: workspace.limitMessagesPerDay };
}

/** A link to an X post, normalised; null when empty. */
function normalisePostUrl(raw: string | undefined): string | null | "invalid" {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = parsePostUrl(value);
  if (!parsed) return "invalid";
  return parsed.username
    ? `https://x.com/${parsed.username}/status/${parsed.postId}`
    : `https://x.com/i/status/${parsed.postId}`;
}

export type OpenMessageError =
  "not_found" | "empty_text" | "too_long" | "invalid_post_url" | "daily_limit";

export async function openMessage(
  workspace: WorkspaceRef,
  input: { targetId: string; text: string; postUrl?: string },
  now: Date = new Date(),
): Promise<Result<{ intentUrl: string; eventId: string }, OpenMessageError>> {
  const text = input.text.trim();
  if (!text) return err("empty_text");
  if (text.length > MAX_MESSAGE_LENGTH) return err("too_long");
  const postUrl = normalisePostUrl(input.postUrl);
  if (postUrl === "invalid") return err("invalid_post_url");

  const target = await replies.findTarget(workspace.id, input.targetId);
  if (!target) return err("not_found");
  const { used, limit } = await messagesToday(workspace, now);
  if (used >= limit) return err("daily_limit");

  const event = await outreach.recordMessageOpened({
    workspaceId: workspace.id,
    targetId: target.id,
    previousStatus: target.status,
    nextStatus: statusAfterMessage(target.status),
    text,
    postUrl,
    now,
  });
  return ok({ intentUrl: dmIntentUrl(target.xUserId, text), eventId: event.id });
}

export async function undoOpenedMessage(
  workspaceId: string,
  eventId: string,
  now: Date = new Date(),
): Promise<Result<null, "not_found">> {
  const notBefore = new Date(now.getTime() - MESSAGE_UNDO_WINDOW_MS);
  return (await outreach.undoMessage(workspaceId, eventId, now, notBefore))
    ? ok(null)
    : err("not_found");
}

export async function changeCreatorStatus(
  workspaceId: string,
  targetId: string,
  status: string,
  now: Date = new Date(),
): Promise<Result<null, "not_found" | "invalid_status">> {
  const parsed = z.enum(CREATOR_STATUSES).safeParse(status);
  if (!parsed.success) return err("invalid_status");
  return (await outreach.recordStatusChange(
    workspaceId,
    targetId,
    parsed.data as CreatorStatus,
    now,
  ))
    ? ok(null)
    : err("not_found");
}

export function creatorHistory(workspaceId: string, targetId: string): Promise<CreatorEvent[]> {
  return outreach.listCreatorEvents(workspaceId, targetId);
}

export const AI_MESSAGE_OPERATION = "aiCollabMessages";
const AI_ESTIMATE_MICROS = 20_000;

export type MessageDraftError =
  | "ai_not_configured"
  | "ai_disabled"
  | "ai_target_limit"
  | "not_found"
  | "invalid_post_url"
  | "budget_exceeded"
  | "ai_declined"
  | "ai_unavailable";

/** Three personal drafts for one creator (drafts only — D-033). */
export async function draftMessages(
  workspace: WorkspaceRef,
  input: { targetId: string; postUrl?: string },
  now: Date = new Date(),
): Promise<Result<string[], MessageDraftError>> {
  if (!aiConfigured()) return err("ai_not_configured");
  const postUrl = normalisePostUrl(input.postUrl);
  if (postUrl === "invalid") return err("invalid_post_url");
  const target = await replies.findTarget(workspace.id, input.targetId);
  if (!target) return err("not_found");

  const { limits, timezone } = await getLimitsContext(workspace.id);
  if (limits && !limits.aiEnabled) return err("ai_disabled");
  if (
    limits &&
    (await usedToday(workspace.id, "AI_MESSAGE", timezone, now, target.id)) >=
      limits.aiIdeasPerTargetPerDay
  ) {
    return err("ai_target_limit");
  }
  if (!(await canSpend(workspace.id, AI_ESTIMATE_MICROS, now))) return err("budget_exceeded");

  let result;
  try {
    result = await suggestCollabMessages({
      creatorName: target.name,
      creatorUsername: target.username,
      creatorBio: target.bio,
      note: target.note,
      postUrl,
      senderName: workspace.name,
    });
  } catch {
    return err("ai_unavailable");
  }
  if (result.kind === "refused") return err("ai_declined");

  await recordUsage({
    workspaceId: workspace.id,
    provider: "AI",
    operation: AI_MESSAGE_OPERATION,
    units: 1,
    unitPriceMicros: aiCostMicros(result.model, result.inputTokens, result.outputTokens),
    now,
  });
  await recordFeatureUsage(workspace.id, "AI_MESSAGE", now, target.id);
  return result.kind === "ok" ? ok(result.ideas) : err("ai_unavailable");
}
