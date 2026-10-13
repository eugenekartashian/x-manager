import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  archiveTrackedLink,
  createTrackedLink,
  dailyLinkClicks,
  listTrackedLinks,
  resolveClick,
} from "@/server/services/links";
import { createOwner, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-13T10:00:00Z");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile";
const codeOf = (url: string) => url.split("/l/")[1] ?? "";

describe("tracked links", () => {
  it("validates new links", async () => {
    const owner = await createOwner("a");
    expect(
      await createTrackedLink(owner.workspaceId, { label: " ", destination: "onlyfans.com/me" }),
    ).toEqual({ ok: false, error: "empty_label" });
    expect(
      await createTrackedLink(owner.workspaceId, { label: "Bio", destination: "javascript:x" }),
    ).toEqual({ ok: false, error: "invalid_destination" });
    const created = await createTrackedLink(owner.workspaceId, {
      label: "Bio",
      destination: "onlyfans.com/me",
    });
    expect(created.ok && created.data.url).toMatch(/\/l\/[A-Za-z2-9]{6}$/);
  });

  it("redirects every visitor but counts only humans; unknown codes go nowhere", async () => {
    const owner = await createOwner("a");
    const created = await createTrackedLink(owner.workspaceId, {
      label: "Bio",
      destination: "https://onlyfans.com/me",
    });
    const code = created.ok ? codeOf(created.data.url) : "";
    const click = (userAgent: string | null, ip: string, now = NOW) =>
      resolveClick({ code, userAgent, ip, country: "ES", now });

    expect(await click(IPHONE, "1.1.1.1")).toBe("https://onlyfans.com/me");
    expect(await click(IPHONE, "1.1.1.1")).toBe("https://onlyfans.com/me"); // same person
    expect(await click(IPHONE, "2.2.2.2")).toBe("https://onlyfans.com/me");
    expect(await click("Twitterbot/1.0", "3.3.3.3")).toBe("https://onlyfans.com/me");
    expect(await resolveClick({ code: "zzzzzz", userAgent: IPHONE, ip: null, country: null })).toBe(
      null,
    );

    const [link] = await listTrackedLinks(owner.workspaceId, NOW);
    expect([link?.total, link?.last7d, link?.unique7d]).toEqual([3, 3, 2]);
    const stored = await prisma.linkClick.findFirstOrThrow();
    expect([stored.country, stored.device]).toEqual(["ES", "phone"]);
    expect(stored.visitorHash).not.toContain("1.1.1.1");
    expect(
      await dailyLinkClicks(owner.workspaceId, new Date("2026-10-12T22:00:00Z"), "Europe/Madrid"),
    ).toEqual([{ day: "2026-10-13", count: 3 }]);
  });

  it("hidden links keep redirecting; other workspaces can't hide or see them", async () => {
    const a = await createOwner("a");
    const b = await createOwner("b");
    const created = await createTrackedLink(a.workspaceId, {
      label: "Old post",
      destination: "https://onlyfans.com/me",
    });
    const code = created.ok ? codeOf(created.data.url) : "";
    const link = await prisma.trackedLink.findUniqueOrThrow({ where: { code } });

    expect(await archiveTrackedLink(b.workspaceId, link.id, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await listTrackedLinks(b.workspaceId, NOW)).toEqual([]);
    expect(await archiveTrackedLink(a.workspaceId, link.id, NOW)).toEqual({ ok: true, data: null });
    expect(await listTrackedLinks(a.workspaceId, NOW)).toEqual([]);
    expect(await resolveClick({ code, userAgent: IPHONE, ip: "1.1.1.1", country: null })).toBe(
      "https://onlyfans.com/me",
    );
  });
});
