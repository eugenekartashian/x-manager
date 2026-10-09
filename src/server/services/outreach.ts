import "server-only";
import { z } from "zod";
import type {
  CreatorEvent,
  CreatorStatus,
  TargetAccount,
  Workspace,
} from "@/generated/prisma/client";
import { parsePostUrl } from "@/lib/post-url";
import { err, ok, type Result } from "@/lib/result";
import { localDateOf, zonedToUtc } from "@/lib/zoned-time";
import {
  chatUrl,
  MAX_MESSAGE_LENGTH,
  MESSAGE_UNDO_WINDOW_MS,
  statusAfterMessage,
  bulkSkipReason,
  MAX_BULK_MESSAGES,
  MAX_REFUSALS_IN_ROW,
  MESSAGE_LIMIT_OPTIONS,
  withPostLink,
  type BulkSkipReason,
} from "@/server/domain/outreach-rules";
import { aiConfigured, suggestCollabMessages } from "@/server/integrations/ai";
import { aiCostMicros } from "@/server/integrations/ai/pricing";
import * as outreach from "@/server/repositories/outreach";
import * as replies from "@/server/repositories/replies";
import { recordUsage } from "@/server/repositories/usage";
import { canSpend } from "@/server/services/budget";
import { CREATOR_STATUSES } from "@/server/services/creators";
import { getLimitsContext, recordFeatureUsage, usedToday } from "@/server/services/limits";
import { getPostsPageData } from "@/server/services/own-posts";
import { connectedXUserId, sendDm, type XActionError } from "@/server/services/x-api";

// Collab outreach (M7.2, D-033): drafts, "Open in X" (the user sends the DM), history and a
// per-day message limit. The only X write is sendMessageViaApi: one click, one message (D-034).

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

export type SentMessageError =
  "not_found" | "empty_text" | "too_long" | "invalid_post_url" | "daily_limit";

/** Link to the 1:1 X chat with a creator (no X call; uses the stored ids). */
export async function chatLinkFor(workspaceId: string, creatorXUserId: string): Promise<string> {
  const me = await connectedXUserId(workspaceId);
  return chatUrl(me.ok ? me.data : null, creatorXUserId);
}

type PreparedMessage = {
  target: NonNullable<Awaited<ReturnType<typeof replies.findTarget>>>;
  text: string;
  postUrl: string | null;
};

async function prepareMessage(
  workspace: WorkspaceRef,
  input: { targetId: string; text: string; postUrl?: string },
  now: Date,
): Promise<Result<PreparedMessage, SentMessageError>> {
  const text = input.text.trim();
  if (!text) return err("empty_text");
  if (text.length > MAX_MESSAGE_LENGTH) return err("too_long");
  const postUrl = normalisePostUrl(input.postUrl);
  if (postUrl === "invalid") return err("invalid_post_url");

  const target = await replies.findTarget(workspace.id, input.targetId);
  if (!target) return err("not_found");
  const { used, limit } = await messagesToday(workspace, now);
  if (used >= limit) return err("daily_limit");
  return ok({ target, text, postUrl });
}

async function saveMessage(workspaceId: string, message: PreparedMessage, now: Date) {
  return outreach.recordMessageOpened({
    workspaceId,
    targetId: message.target.id,
    previousStatus: message.target.status,
    nextStatus: statusAfterMessage(message.target.status),
    text: message.text,
    postUrl: message.postUrl,
    now,
  });
}

/**
 * Records a message the user sends themselves in X (opening the chat counts as sent; undo
 * within 24 h). History and the daily count reflect these records.
 */
export async function recordSentMessage(
  workspace: WorkspaceRef,
  input: { targetId: string; text: string; postUrl?: string },
  now: Date = new Date(),
): Promise<Result<{ eventId: string }, SentMessageError>> {
  const prepared = await prepareMessage(workspace, input, now);
  if (!prepared.ok) return prepared;
  const event = await saveMessage(workspace.id, prepared.data, now);
  return ok({ eventId: event.id });
}

export type ApiMessageError = SentMessageError | XActionError;

/**
 * Sends ONE message through the X API after the user clicked "Send via X API" for this exact
 * text and creator (D-034). Recorded only when X confirms; an unknown outcome is not retried.
 */
export async function sendMessageViaApi(
  workspace: WorkspaceRef,
  input: { targetId: string; text: string; postUrl?: string },
  now: Date = new Date(),
): Promise<Result<{ eventId: string }, ApiMessageError>> {
  const prepared = await prepareMessage(workspace, input, now);
  if (!prepared.ok) return prepared;
  const sent = await sendDm(workspace.id, prepared.data.target.xUserId, prepared.data.text);
  if (!sent.ok) return sent;
  const event = await saveMessage(workspace.id, prepared.data, now);
  return ok({ eventId: event.id });
}

/** Messages per day for this workspace (one of MESSAGE_LIMIT_OPTIONS). */
export async function saveMessageLimit(
  workspaceId: string,
  perDay: number,
): Promise<Result<null, "invalid_limit">> {
  if (!(MESSAGE_LIMIT_OPTIONS as readonly number[]).includes(perDay)) return err("invalid_limit");
  await outreach.updateMessageLimit(workspaceId, perDay);
  return ok(null);
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

// ─── Own posts a message can link to ─────────────────────────────────────────

export type PostOption = { url: string; label: string };

/** Repost-list posts first, then recent ones (stored data, no X calls). */
export async function messagePostOptions(
  workspaceId: string,
  username: string,
  now: Date = new Date(),
): Promise<PostOption[]> {
  const ownPosts = await getPostsPageData(workspaceId, now);
  if (!ownPosts.connected) return [];
  return [...ownPosts.rotation, ...ownPosts.recent]
    .filter((post, index, all) => all.findIndex((other) => other.id === post.id) === index)
    .slice(0, 12)
    .map((post) => ({
      url: `https://x.com/${username}/status/${post.xPostId}`,
      label: `${post.inRotation ? "★ " : ""}${(post.text || "(media)").replace(/\s+/g, " ").slice(0, 60)}`,
    }));
}

// ─── Bulk messages via the X API (superadmin, D-035) ─────────────────────────

export type BulkCandidates = {
  ready: TargetAccount[];
  skipped: { creator: TargetAccount; reason: BulkSkipReason }[];
};

/** Selected creators split into "will be messaged" and "skipped (why)". */
export async function bulkCandidates(
  workspaceId: string,
  ids: string[],
  now: Date = new Date(),
): Promise<BulkCandidates> {
  const creators = await outreach.findCreatorsByIds(workspaceId, ids, MAX_BULK_MESSAGES);
  const result: BulkCandidates = { ready: [], skipped: [] };
  for (const creator of creators) {
    const reason = bulkSkipReason(creator, now);
    if (reason) result.skipped.push({ creator, reason });
    else result.ready.push(creator);
  }
  return result;
}

export type BulkItemResult =
  | { targetId: string; ok: true }
  | {
      targetId: string;
      ok: false;
      error: ApiMessageError | BulkSkipReason | "not_sent" | "x_refusing";
    };

/** Errors after which nothing else in the batch is sent (the next call would fail too). */
const STOP_BATCH = new Set<string>([
  "daily_limit",
  "rate_limited",
  "no_credits",
  "needs_reconnect",
  "not_connected",
  "x_unavailable",
  "unknown_outcome",
]);

/**
 * Sends each prepared message, one after another (owner decision D-035: one click sends the
 * reviewed batch). Same validation and daily limit as single messages; a creator who became
 * ineligible is skipped; errors that would repeat stop the batch and are never retried.
 */
export async function sendBulkViaApi(
  workspace: WorkspaceRef,
  input: { items: { targetId: string; text: string }[]; postUrl?: string },
  now: Date = new Date(),
): Promise<Result<BulkItemResult[], "too_many" | "invalid_post_url">> {
  const items = input.items.filter(
    (item, index, all) => all.findIndex((other) => other.targetId === item.targetId) === index,
  );
  if (items.length > MAX_BULK_MESSAGES) return err("too_many");
  const postUrl = normalisePostUrl(input.postUrl);
  if (postUrl === "invalid") return err("invalid_post_url");

  const results: BulkItemResult[] = [];
  let stopped: "not_sent" | "x_refusing" | null = null;
  let refusalsInRow = 0;
  for (const item of items) {
    if (stopped) {
      results.push({ targetId: item.targetId, ok: false, error: stopped });
      continue;
    }
    const creator = await replies.findTarget(workspace.id, item.targetId);
    const reason = creator ? bulkSkipReason(creator, now) : null;
    if (reason) {
      results.push({ targetId: item.targetId, ok: false, error: reason });
      continue;
    }
    const sent = await sendMessageViaApi(
      workspace,
      {
        targetId: item.targetId,
        text: withPostLink(item.text, postUrl),
        ...(postUrl ? { postUrl } : {}),
      },
      now,
    );
    if (sent.ok) {
      refusalsInRow = 0;
      results.push({ targetId: item.targetId, ok: true });
    } else {
      results.push({ targetId: item.targetId, ok: false, error: sent.error });
      refusalsInRow = sent.error === "forbidden" ? refusalsInRow + 1 : 0;
      if (STOP_BATCH.has(sent.error)) stopped = "not_sent";
      else if (refusalsInRow >= MAX_REFUSALS_IN_ROW) stopped = "x_refusing";
    }
  }
  return ok(results);
}
