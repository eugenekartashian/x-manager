import "server-only";
import type { OwnPost, RepostStatus, UserRole, Workspace } from "@/generated/prisma/client";
import { addDays, localDateOf, zonedToUtc } from "@/lib/zoned-time";
import * as dashboard from "@/server/repositories/dashboard";
import * as replies from "@/server/repositories/replies";
import * as runs from "@/server/repositories/repost-runs";
import { findConnection } from "@/server/repositories/x-accounts";
import { budgetLevel, getBudgetStatus, type BudgetStatus } from "@/server/services/budget";
import { getLimits } from "@/server/services/limits";
import { getSchedulePageData } from "@/server/services/schedule";

// Dashboard (M6.7): "is everything running, and what needs me?" — only stored data,
// no X or AI calls. Money appears only for the superadmin.

export const CHART_DAYS = 14;

export type Attention = { tone: "red" | "amber"; message: string; href: string; action: string };

export type BatchPreview = {
  runAt: Date;
  items: { key: string; text: string; skipReason: string | null }[];
};

export type DashboardData = {
  attention: Attention[];
  scheduleActive: boolean;
  nextBatch: BatchPreview | null;
  lastBatch: { runAt: Date; counts: Partial<Record<RepostStatus, number>> } | null;
  today: {
    replies: number;
    repliesLimit: number;
    targetLoads: number;
    targetLoadsLimit: number | null;
    aiIdeas: number;
    spendMicros: bigint | null; // superadmin only
  };
  budget: BudgetStatus | null; // superadmin only
  chart: {
    days: string[]; // YYYY-MM-DD, oldest first, workspace timezone
    reposts: { succeeded: number; skipped: number; problems: number }[];
    replies: number[];
    spendMicros: bigint[] | null; // superadmin only
  };
  recentRuns: Awaited<ReturnType<typeof runs.listRecentRuns>>;
};

export async function getDashboardData(
  workspace: Workspace,
  role: UserRole,
  now: Date = new Date(),
): Promise<DashboardData> {
  const tz = workspace.timezone;
  const isAdmin = role === "SUPERADMIN";
  const today = localDateOf(now, tz);
  const days = Array.from({ length: CHART_DAYS }, (_, index) =>
    addDays(today, index - (CHART_DAYS - 1)),
  );
  const chartStart = zonedToUtc(days[0] ?? today, "00:00", tz);
  const dayStart = zonedToUtc(today, "00:00", tz);
  const last24h = new Date(now.getTime() - 24 * 3_600_000);

  const [
    connection,
    budget,
    limits,
    schedule,
    recent,
    problems,
    repliesToday,
    featureToday,
    runsPerDay,
    repliesPerDay,
    spendPerDay,
  ] = await Promise.all([
    findConnection(workspace.id),
    getBudgetStatus(workspace.id, now),
    getLimits(workspace.id),
    getSchedulePageData(workspace, now),
    runs.listRecentRuns(workspace.id, 30),
    runs.countRunsByStatus(workspace.id, last24h),
    replies.countOpenedSince(workspace.id, dayStart),
    dashboard.countFeatureUsageSince(workspace.id, dayStart),
    dashboard.dailyRunsByStatus(workspace.id, chartStart, tz),
    dashboard.dailyReplies(workspace.id, chartStart, tz),
    isAdmin ? dashboard.dailySpendMicros(workspace.id, chartStart, tz) : Promise.resolve([]),
  ]);

  // ── Needs attention ──
  const attention: Attention[] = [];
  if (!connection) {
    attention.push({
      tone: "amber",
      message: "Your X account is not connected.",
      href: "#x-account",
      action: "Connect X",
    });
  } else if (connection.status === "NEEDS_RECONNECT") {
    attention.push({
      tone: "red",
      message: "X access expired — Reposts are paused.",
      href: "#x-account",
      action: "Reconnect X",
    });
  }
  const toCheck = problems.FAILED + problems.UNKNOWN;
  if (toCheck > 0) {
    attention.push({
      tone: problems.UNKNOWN > 0 ? "amber" : "red",
      message: `${toCheck} Repost${toCheck === 1 ? "" : "s"} failed or need checking in the last 24 h.`,
      href: "/history?filter=problems",
      action: "Open history",
    });
  }
  const level = budgetLevel(budget);
  if (level !== "ok") {
    attention.push({
      tone: level === "exhausted" ? "red" : "amber",
      message:
        level === "exhausted"
          ? "This month's usage limit is reached — Reposts and loads are paused."
          : "Over 80% of this month's usage limit is used.",
      href: isAdmin ? "/history" : "/schedule",
      action: isAdmin ? "See spend" : "Open schedule",
    });
  }
  if (schedule.schedule.active && (schedule.listSize === 0 || schedule.slots.length === 0)) {
    attention.push({
      tone: "amber",
      message:
        schedule.listSize === 0
          ? "The schedule is on, but your repost list is empty."
          : "The schedule is on, but it has no daily times.",
      href: schedule.listSize === 0 ? "/posts" : "/schedule",
      action: schedule.listSize === 0 ? "Add posts" : "Add times",
    });
  }

  // ── Next and last batch ──
  const first = schedule.preview[0];
  const nextBatch: BatchPreview | null = first
    ? {
        runAt: first.runAt,
        items: schedule.preview
          .filter((item) => item.batchKey === first.batchKey)
          .map((item) => ({
            key: item.key,
            text: postLabel(item.post),
            skipReason: item.skipReason,
          })),
      }
    : null;
  const latest = recent[0];
  const lastBatch = latest
    ? {
        runAt: latest.runAt,
        counts: recent
          .filter((run) => run.runAt.getTime() === latest.runAt.getTime())
          .reduce<Partial<Record<RepostStatus, number>>>((counts, run) => {
            counts[run.status] = (counts[run.status] ?? 0) + 1;
            return counts;
          }, {}),
      }
    : null;

  // ── Charts ──
  const byDay = <T>(rows: (T & { day: string })[]) => new Map(rows.map((row) => [row.day, row]));
  const repliesMap = byDay(repliesPerDay);
  const spendMap = byDay(spendPerDay);
  const reposts = days.map((day) => {
    const rows = runsPerDay.filter((row) => row.day === day);
    const sum = (statuses: RepostStatus[]) =>
      rows
        .filter((row) => statuses.includes(row.status))
        .reduce((total, row) => total + row.count, 0);
    return {
      succeeded: sum(["SUCCEEDED"]),
      skipped: sum(["SKIPPED"]),
      problems: sum(["FAILED", "UNKNOWN"]),
    };
  });
  const featureCount = (kind: "TARGET_LOAD" | "AI_IDEAS") =>
    featureToday.find((row) => row.kind === kind)?._count._all ?? 0;

  return {
    attention,
    scheduleActive: schedule.schedule.active,
    nextBatch,
    lastBatch,
    today: {
      replies: repliesToday,
      repliesLimit: workspace.replyDailyLimit,
      targetLoads: featureCount("TARGET_LOAD"),
      targetLoadsLimit: limits?.targetLoadsPerDay ?? null,
      aiIdeas: featureCount("AI_IDEAS"),
      spendMicros: isAdmin ? (spendMap.get(today)?.micros ?? 0n) : null,
    },
    budget: isAdmin ? budget : null,
    chart: {
      days,
      reposts,
      replies: days.map((day) => repliesMap.get(day)?.count ?? 0),
      spendMicros: isAdmin ? days.map((day) => spendMap.get(day)?.micros ?? 0n) : null,
    },
    recentRuns: recent.slice(0, 5),
  };
}

function postLabel(post: OwnPost | null): string {
  if (!post) return "(post unavailable)";
  const text = post.text.replace(/\s+/g, " ").trim();
  return text || "(media only)";
}
