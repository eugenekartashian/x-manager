import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  refreshOwnPosts,
  REFRESH_MIN_INTERVAL_MS,
  setInRotation,
} from "@/server/services/own-posts";
import {
  addSlot,
  getSchedulePageData,
  removeSlot,
  saveRepostLimits,
  saveSchedule,
} from "@/server/services/schedule";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, meReply, postsReply } from "../helpers/fake-x";

let restoreFetch: (() => void) | undefined;
function withFakeX(...args: Parameters<typeof fakeX>) {
  restoreFetch?.();
  const fake = fakeX(...args);
  restoreFetch = fake.restore;
  return fake;
}

beforeEach(resetDatabase);
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-01T06:00:00Z"); // 08:00 Madrid

async function setup(suffix: "a" | "b" = "a", ids = ["3", "2", "1"], pinned = "1") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, { xUserId: `x-${suffix}`, accessToken: `t-${suffix}` });
  withFakeX({ posts: () => postsReply(ids), me: () => meReply(`x-${suffix}`, suffix, pinned) });
  await refreshOwnPosts(owner.workspaceId, NOW);
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
  return { ...owner, workspace };
}

async function postId(workspaceId: string, xPostId: string) {
  return (await prisma.ownPost.findFirstOrThrow({ where: { workspaceId, xPostId } })).id;
}

describe("schedule settings", () => {
  it("creates an inactive schedule starting today on first view", async () => {
    const { workspace } = await setup();

    const data = await getSchedulePageData(workspace, NOW);

    expect(data.schedule).toMatchObject({
      active: false,
      startDate: "2026-10-01",
      durationDays: null,
    });
    expect(data.preview).toEqual([]);
  });

  it("validates dates and durations", async () => {
    const { workspace } = await setup();

    expect(
      await saveSchedule(workspace, { active: true, startDate: "2026-02-30", durationDays: 5 }),
    ).toEqual({
      ok: false,
      error: "invalid_date",
    });
    for (const durationDays of [0, 400, 1.5]) {
      expect(
        (await saveSchedule(workspace, { active: true, startDate: "2026-10-01", durationDays })).ok,
      ).toBe(false);
    }
    expect(
      (await saveSchedule(workspace, { active: true, startDate: "2026-10-01", durationDays: null }))
        .ok,
    ).toBe(true);
  });

  it("validates limits against the allowed options and the hard ceiling of 8", async () => {
    const { workspace } = await setup();

    expect(await saveRepostLimits(workspace.id, { minIntervalHours: 1, dailyCap: 5 })).toEqual({
      ok: false,
      error: "invalid_interval",
    });
    expect(await saveRepostLimits(workspace.id, { minIntervalHours: 4, dailyCap: 9 })).toEqual({
      ok: false,
      error: "invalid_cap",
    });
    expect(await saveRepostLimits(workspace.id, { minIntervalHours: 3, dailyCap: 8 })).toEqual({
      ok: true,
      data: null,
    });
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).toMatchObject(
      {
        perPostMinIntervalMinutes: 180,
        dailyRepostCap: 8,
      },
    );
  });
});

describe("slots", () => {
  it("rejects invalid time and timezone", async () => {
    const { workspace } = await setup();
    const base = { target: "NEXT_FROM_LIST" as const, ownPostId: null };

    expect(
      await addSlot(workspace, { ...base, localTime: "25:00", timezone: "Europe/Madrid" }, NOW),
    ).toEqual({
      ok: false,
      error: "invalid_time",
    });
    expect(
      await addSlot(workspace, { ...base, localTime: "09:00", timezone: "Mars/Base" }, NOW),
    ).toEqual({
      ok: false,
      error: "invalid_timezone",
    });
  });

  it("allows at most 8 daily times", async () => {
    const { workspace } = await setup();
    for (let hour = 8; hour < 16; hour++) {
      const result = await addSlot(
        workspace,
        {
          localTime: `${String(hour).padStart(2, "0")}:00`,
          timezone: "Europe/Madrid",
          target: "NEXT_FROM_LIST",
          ownPostId: null,
        },
        NOW,
      );
      expect(result.ok).toBe(true);
    }
    expect(
      await addSlot(
        workspace,
        { localTime: "20:00", timezone: "UTC", target: "PINNED", ownPostId: null },
        NOW,
      ),
    ).toEqual({ ok: false, error: "too_many_slots" });
  });

  it("only lets a slot target the workspace's own posts", async () => {
    const a = await setup("a");
    const b = await setup("b", ["9"], "9");
    const postOfB = await postId(b.workspaceId, "9");

    expect(
      await addSlot(
        a.workspace,
        { localTime: "09:00", timezone: "UTC", target: "POST", ownPostId: postOfB },
        NOW,
      ),
    ).toEqual({ ok: false, error: "not_found" });
    expect(
      await addSlot(
        a.workspace,
        { localTime: "09:00", timezone: "UTC", target: "POST", ownPostId: null },
        NOW,
      ),
    ).toEqual({ ok: false, error: "post_required" });
  });

  it("never deletes another workspace's slot", async () => {
    const a = await setup("a");
    const b = await setup("b", ["9"], "9");
    await addSlot(
      a.workspace,
      { localTime: "09:00", timezone: "UTC", target: "PINNED", ownPostId: null },
      NOW,
    );
    const slotOfA = await prisma.repostSlot.findFirstOrThrow({
      where: { workspaceId: a.workspaceId },
    });

    expect(await removeSlot(b.workspaceId, slotOfA.id)).toEqual({ ok: false, error: "not_found" });
    expect(await prisma.repostSlot.count()).toBe(1);
    expect(await removeSlot(a.workspaceId, slotOfA.id)).toEqual({ ok: true, data: null });
  });

  it("keeps a post chosen by a slot when posts are refreshed", async () => {
    const { workspace, workspaceId } = await setup();
    const chosen = await postId(workspaceId, "2");
    await addSlot(
      workspace,
      { localTime: "09:00", timezone: "UTC", target: "POST", ownPostId: chosen },
      NOW,
    );
    withFakeX({
      posts: () => postsReply(["5"]),
      me: () => meReply("x-a", "a", "1"),
      post: () => ({ status: 404, body: {} }),
    });

    await refreshOwnPosts(workspaceId, new Date(NOW.getTime() + REFRESH_MIN_INTERVAL_MS + 1));

    expect(await prisma.ownPost.findUnique({ where: { id: chosen } })).not.toBeNull();
  });
});

describe("preview and estimate", () => {
  it("previews the next 48 hours and estimates cost", async () => {
    const { workspace, workspaceId } = await setup();
    for (const id of ["3", "2"])
      await setInRotation(workspaceId, await postId(workspaceId, id), true);
    await saveSchedule(workspace, { active: true, startDate: "2026-10-01", durationDays: 1 });
    await addSlot(
      workspace,
      { localTime: "10:00", timezone: "Europe/Madrid", target: "PINNED", ownPostId: null },
      NOW,
    );
    await addSlot(
      workspace,
      { localTime: "13:00", timezone: "Europe/Madrid", target: "NEXT_FROM_LIST", ownPostId: null },
      NOW,
    );
    await addSlot(
      workspace,
      { localTime: "10:00", timezone: "America/New_York", target: "PINNED", ownPostId: null },
      NOW,
    );

    const data = await getSchedulePageData(workspace, NOW);

    expect(
      data.preview.map((item) => [
        item.runAt.toISOString().slice(11, 16),
        item.post?.xPostId ?? null,
        item.skipReason,
      ]),
    ).toEqual([
      ["08:00", "1", null],
      ["11:00", "3", null],
      ["14:00", "1", null],
    ]); // one day only (duration 1)
    expect(data.estimate).toEqual({
      repostsPerDay: 3,
      perDayMicros: 75_000,
      perMonthMicros: 2_250_000,
    });
  });

  it("ignores a slot's post that belongs to a previously connected X account", async () => {
    const { workspace, workspaceId } = await setup();
    await saveSchedule(workspace, { active: true, startDate: "2026-10-01", durationDays: null });
    await addSlot(
      workspace,
      {
        localTime: "10:00",
        timezone: "UTC",
        target: "POST",
        ownPostId: await postId(workspaceId, "2"),
      },
      NOW,
    );
    await prisma.xAccount.update({ where: { workspaceId }, data: { xUserId: "x-other" } });

    const data = await getSchedulePageData(workspace, NOW);

    expect(data.preview[0]).toMatchObject({ postId: null, skipReason: "no_post" });
  });
});
