import "server-only";
import type { ReplyTemplate, TargetAccount, TargetPost } from "@/generated/prisma/client";
import { err, ok, type Result } from "@/lib/result";
import { localDateOf, zonedToUtc } from "@/lib/zoned-time";
import {
  MAX_REPLY_LENGTH,
  MAX_TEMPLATES,
  REPLY_LIMITS,
  replyBlock,
  replyIntentUrl,
  TARGET_POSTS_MIN_INTERVAL_MS,
  TARGET_POSTS_PER_LOAD,
  type ReplyBlock,
} from "@/server/domain/reply-rules";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import * as replies from "@/server/repositories/replies";
import { canSpend } from "@/server/services/budget";
import { fetchUserPosts, type XActionError } from "@/server/services/x-api";

// Reply assistant (M3): the app prepares, the user posts on x.com (D-008, D-020).

type WorkspaceRef = { id: string; timezone: string };

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
    block: replyBlock({ lastRepliedAt, repliesToday: today, now }),
  };
}

export type LoadPostsError = XActionError | "not_found" | "too_soon" | "budget_exceeded";

/** Fetches the target's latest posts (on demand, throttled, budget-checked). */
export async function loadTargetPosts(
  workspaceId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<Result<{ loaded: number }, LoadPostsError>> {
  const target = await replies.findTarget(workspaceId, targetId);
  if (!target) return err("not_found");
  if (!(await canSpend(workspaceId, TARGET_POSTS_PER_LOAD * 2 * X_PRICE_MICROS.postRead, now))) {
    return err("budget_exceeded");
  }
  if (
    !(await replies.claimTargetPostsLoad(workspaceId, target.id, now, TARGET_POSTS_MIN_INTERVAL_MS))
  ) {
    return err("too_soon");
  }
  const posts = await fetchUserPosts(workspaceId, target.xUserId, TARGET_POSTS_PER_LOAD);
  if (!posts.ok) return posts;
  await replies.replaceTargetPosts(workspaceId, target.id, posts.data, now);
  return ok({ loaded: posts.data.length });
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

export { REPLY_LIMITS };
