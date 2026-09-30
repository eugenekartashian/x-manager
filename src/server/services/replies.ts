import "server-only";
import type { ReplyTemplate, TargetAccount, TargetPost } from "@/generated/prisma/client";
import { err, ok, type Result } from "@/lib/result";
import { localDateOf, zonedToUtc } from "@/lib/zoned-time";
import {
  MAX_REPLY_LENGTH,
  MAX_TEMPLATES,
  REPLY_COOLDOWN_HOUR_OPTIONS,
  REPLY_DAILY_LIMIT_OPTIONS,
  replyBlock,
  replyIntentUrl,
  TARGET_POSTS_FETCHED,
  TARGET_POSTS_MIN_INTERVAL_MS,
  TARGET_POSTS_SHOWN,
  type ReplyBlock,
  type ReplyLimits,
} from "@/server/domain/reply-rules";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import * as replies from "@/server/repositories/replies";
import { canSpend } from "@/server/services/budget";
import { getLimitsContext, recordFeatureUsage, usedToday } from "@/server/services/limits";
import { fetchUserPosts, type XActionError } from "@/server/services/x-api";

// Reply assistant (M3): the app prepares, the user posts on x.com (D-008, D-020).

type WorkspaceRef = {
  id: string;
  timezone: string;
  replyCooldownHours: number;
  replyDailyLimit: number;
};

function limitsOf(workspace: WorkspaceRef): ReplyLimits {
  return { cooldownHours: workspace.replyCooldownHours, perDay: workspace.replyDailyLimit };
}

function startOfLocalDay(now: Date, timeZone: string): Date {
  return zonedToUtc(localDateOf(now, timeZone), "00:00", timeZone);
}

async function repliesToday(workspace: WorkspaceRef, now: Date): Promise<number> {
  return replies.countOpenedSince(workspace.id, startOfLocalDay(now, workspace.timezone));
}

// ─── Templates ───────────────────────────────────────────────────────────────

export function listTemplates(workspaceId: string): Promise<ReplyTemplate[]> {
  return replies.listTemplates(workspaceId);
}

export async function addTemplate(
  workspaceId: string,
  text: string,
): Promise<Result<null, "empty_text" | "too_long" | "too_many">> {
  const trimmed = text.trim();
  if (!trimmed) return err("empty_text");
  if (trimmed.length > MAX_REPLY_LENGTH) return err("too_long");
  if ((await replies.countTemplates(workspaceId)) >= MAX_TEMPLATES) return err("too_many");
  await replies.createTemplate(workspaceId, trimmed);
  return ok(null);
}

export async function removeTemplate(
  workspaceId: string,
  id: string,
): Promise<Result<null, "not_found">> {
  return (await replies.deleteTemplate(workspaceId, id)) ? ok(null) : err("not_found");
}

// ─── Session ─────────────────────────────────────────────────────────────────

export type SessionData = {
  target: TargetAccount;
  posts: TargetPost[];
  templates: ReplyTemplate[];
  block: ReplyBlock;
  repliesToday: number;
  limits: ReplyLimits;
};

export async function getSessionData(
  workspace: WorkspaceRef,
  targetId: string,
  now: Date = new Date(),
): Promise<SessionData | null> {
  const target = await replies.findTarget(workspace.id, targetId);
  if (!target) return null;
  const [posts, templates, today, lastRepliedAt] = await Promise.all([
    replies.listTargetPosts(workspace.id, target.id),
    replies.listTemplates(workspace.id),
    repliesToday(workspace, now),
    replies.lastOpenedForTarget(workspace.id, target.id),
  ]);
  return {
    target,
    posts,
    templates,
    repliesToday: today,
    limits: limitsOf(workspace),
    block: replyBlock({ lastRepliedAt, repliesToday: today, limits: limitsOf(workspace), now }),
  };
}

export type LoadPostsError =
  | XActionError
  | "not_found"
  | "too_soon"
  | "budget_exceeded"
  | "feature_disabled"
  | "daily_load_limit";

/** Fetches the target's latest posts (on demand, throttled, budget-checked). */
export async function loadTargetPosts(
  workspaceId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<Result<{ loaded: number }, LoadPostsError>> {
  const target = await replies.findTarget(workspaceId, targetId);
  if (!target) return err("not_found");
  const { limits, timezone } = await getLimitsContext(workspaceId);
  if (limits && !limits.targetsEnabled) return err("feature_disabled");
  if (
    limits &&
    (await usedToday(workspaceId, "TARGET_LOAD", timezone, now)) >= limits.targetLoadsPerDay
  ) {
    return err("daily_load_limit");
  }
  if (!(await canSpend(workspaceId, TARGET_POSTS_FETCHED * 2 * X_PRICE_MICROS.postRead, now))) {
    return err("budget_exceeded");
  }
  if (
    !(await replies.claimTargetPostsLoad(workspaceId, target.id, now, TARGET_POSTS_MIN_INTERVAL_MS))
  ) {
    return err("too_soon");
  }
  // Fetch extra: replies and Reposts are filtered out, keep the latest original posts.
  const posts = await fetchUserPosts(workspaceId, target.xUserId, TARGET_POSTS_FETCHED);
  if (!posts.ok) return posts;
  await recordFeatureUsage(workspaceId, "TARGET_LOAD", now, target.id);
  const latest = posts.data.slice(0, TARGET_POSTS_SHOWN);
  await replies.replaceTargetPosts(workspaceId, target.id, latest, now);
  return ok({ loaded: latest.length });
}

export type OpenReplyError =
  "not_found" | "empty_text" | "too_long" | "account_cooldown" | "daily_limit";

/**
 * Records the reply and returns X's composer URL. Only posts loaded for this target
 * can be replied to, and the limits are enforced here, server-side.
 */
export async function openReply(
  workspace: WorkspaceRef,
  input: { targetId: string; xPostId: string; text: string },
  now: Date = new Date(),
): Promise<Result<{ intentUrl: string }, OpenReplyError>> {
  const text = input.text.trim();
  if (!text) return err("empty_text");
  if (text.length > MAX_REPLY_LENGTH) return err("too_long");

  const target = await replies.findTarget(workspace.id, input.targetId);
  if (!target) return err("not_found");
  const post = await replies.findTargetPost(workspace.id, target.id, input.xPostId);
  if (!post) return err("not_found");

  const block = replyBlock({
    lastRepliedAt: await replies.lastOpenedForTarget(workspace.id, target.id),
    repliesToday: await repliesToday(workspace, now),
    limits: limitsOf(workspace),
    now,
  });
  if (block) return err(block.reason);

  await replies.recordOpened({
    workspaceId: workspace.id,
    target,
    xPostId: post.xPostId,
    text,
    now,
  });
  return ok({ intentUrl: replyIntentUrl(post.xPostId, text) });
}

export async function undoReply(
  workspaceId: string,
  replyId: string,
  now: Date = new Date(),
): Promise<Result<null, "not_found">> {
  return (await replies.undoReply(workspaceId, replyId, now)) ? ok(null) : err("not_found");
}

export function listRecentReplies(workspaceId: string) {
  return replies.listRecentReplies(workspaceId, 20);
}

export async function saveReplyLimits(
  workspaceId: string,
  input: { cooldownHours: number; perDay: number },
): Promise<Result<null, "invalid_limits">> {
  const cooldownOk = (REPLY_COOLDOWN_HOUR_OPTIONS as readonly number[]).includes(
    input.cooldownHours,
  );
  const dailyOk = (REPLY_DAILY_LIMIT_OPTIONS as readonly number[]).includes(input.perDay);
  if (!cooldownOk || !dailyOk) return err("invalid_limits");
  await replies.updateReplyLimits(workspaceId, input.cooldownHours, input.perDay);
  return ok(null);
}
