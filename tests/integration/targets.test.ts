import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as exportRoute } from "@/app/api/targets/export/route";
import { prisma } from "@/server/db";
import {
  addTargets,
  csvCell,
  exportTargetsCsv,
  listTargets,
  removeTarget,
  saveTargetNote,
} from "@/server/services/targets";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, usersByReply } from "../helpers/fake-x";

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

const T0 = new Date("2026-10-01T10:00:00Z");

async function connectedOwner(suffix: "a" | "b" = "a") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `me-${suffix}`,
    accessToken: `t-${suffix}`,
  });
  return owner;
}

const KNOWN = {
  alex__ink: { id: "1", followers: 5_000 },
  giovanni33xxx: { id: "2", followers: 20_000 },
  eugenebarcelona: { id: "me-a" },
};

describe("addTargets", () => {
  it("looks up handles on X, stores profiles and reports what happened", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ usersBy: usersByReply(KNOWN) });

    const result = await addTargets(
      owner.workspaceId,
      "@alex__ink\nhttps://x.com/Giovanni33xxx\nghost_account\nbad-handle\neugenebarcelona",
      T0,
    );

    expect(result).toEqual({
      ok: true,
      data: {
        added: ["alex__ink", "giovanni33xxx"],
        alreadyInList: [],
        notFound: ["ghost_account"],
        invalid: ["bad-handle"],
        skippedSelf: true,
      },
    });
    expect(x.calls[0]?.url.searchParams.get("user.fields")).toBe(
      "description,profile_image_url,public_metrics,verified",
    );
    const list = await listTargets(owner.workspaceId, "followers");
    expect(list.map((target) => [target.username, target.followersCount])).toEqual([
      ["giovanni33xxx", 20_000],
      ["alex__ink", 5_000],
    ]);
    expect(list[0]?.avatarUrl).toBe("https://pbs.twimg.com/profile_images/2.jpg");
    // Billed per returned user (3 incl. self), once per day.
    const usage = await prisma.externalUsage.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect([usage.operation, usage.billedUnits, usage.costMicros]).toEqual([
      "userRead",
      3,
      30_000n,
    ]);
  });

  it("skips handles already in the list without calling X", async () => {
    const owner = await connectedOwner();
    withFakeX({ usersBy: usersByReply(KNOWN) });
    await addTargets(owner.workspaceId, "alex__ink", T0);
    const x = withFakeX({});

    expect(await addTargets(owner.workspaceId, "@ALEX__INK", T0)).toMatchObject({
      ok: true,
      data: { added: [], alreadyInList: ["ALEX__INK"] },
    });
    expect(x.calls).toHaveLength(0);
  });

  it("rejects empty input and more than 100 handles", async () => {
    const owner = await connectedOwner();
    const many = Array.from({ length: 101 }, (_, i) => `user${i}`).join("\n");

    expect(await addTargets(owner.workspaceId, "  ", T0)).toEqual({
      ok: false,
      error: "nothing_to_add",
    });
    expect(await addTargets(owner.workspaceId, many, T0)).toEqual({ ok: false, error: "too_many" });
  });

  it("stops before calling X when the budget is used up", async () => {
    const owner = await connectedOwner();
    await prisma.externalUsage.create({
      data: {
        workspaceId: owner.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 10_000_000n,
        occurredAt: T0,
      },
    });
    const x = withFakeX({});

    expect(await addTargets(owner.workspaceId, "alex__ink", T0)).toEqual({
      ok: false,
      error: "budget_exceeded",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("requires a connected X account", async () => {
    const owner = await createOwner("a");
    expect(await addTargets(owner.workspaceId, "alex__ink", T0)).toEqual({
      ok: false,
      error: "not_connected",
    });
  });
});

describe("target isolation and edits", () => {
  it("keeps lists separate per workspace", async () => {
    const a = await connectedOwner("a");
    const b = await connectedOwner("b");
    withFakeX({ usersBy: usersByReply(KNOWN) });
    await addTargets(a.workspaceId, "alex__ink", T0);
    const targetOfA = (await listTargets(a.workspaceId, "followers"))[0];
    if (!targetOfA) throw new Error("setup failed");

    expect(await listTargets(b.workspaceId, "followers")).toEqual([]);
    expect(await removeTarget(b.workspaceId, targetOfA.id)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await saveTargetNote(b.workspaceId, targetOfA.id, "hack")).toEqual({
      ok: false,
      error: "not_found",
    });

    expect(await saveTargetNote(a.workspaceId, targetOfA.id, "  likes gym posts ")).toEqual({
      ok: true,
      data: null,
    });
    expect((await listTargets(a.workspaceId, "followers"))[0]?.note).toBe("likes gym posts");
    expect(await removeTarget(a.workspaceId, targetOfA.id)).toEqual({ ok: true, data: null });
  });

  it("limits note length", async () => {
    const owner = await connectedOwner();
    withFakeX({ usersBy: usersByReply(KNOWN) });
    await addTargets(owner.workspaceId, "alex__ink", T0);
    const target = (await listTargets(owner.workspaceId, "followers"))[0];

    expect(await saveTargetNote(owner.workspaceId, target?.id ?? "", "x".repeat(201))).toEqual({
      ok: false,
      error: "too_long",
    });
  });
});

describe("CSV export", () => {
  it("exports the workspace's targets with Excel-safe cells", async () => {
    const owner = await connectedOwner();
    withFakeX({ usersBy: usersByReply(KNOWN) });
    await addTargets(owner.workspaceId, "alex__ink", T0);
    const target = (await listTargets(owner.workspaceId, "followers"))[0];
    await saveTargetNote(owner.workspaceId, target?.id ?? "", '=HYPERLINK("http://evil")');

    const csv = await exportTargetsCsv(owner.workspaceId, "Europe/Madrid");

    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      "username,name,followers,following,posts,bio,note,last_replied_at,profile_url,stats_as_of,added_at",
    );
    expect(row).toContain('"@alex__ink"');
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(row).toContain('"https://x.com/alex__ink"');
    expect(row).toMatch(/"\d{4}-\d{2}-\d{2} \d{2}:\d{2}","\d{4}-\d{2}-\d{2} \d{2}:\d{2}"$/);
  });

  it("neutralises formulas but keeps plain @handles", () => {
    expect(csvCell("@alex")).toBe('"@alex"');
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("requires a session for the download route", async () => {
    await expect(exportRoute()).rejects.toThrow();
  });
});
