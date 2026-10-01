import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hasAppAccess, inviteUser } from "@/server/services/access";
import {
  approveRequest,
  dismissRequest,
  listAccessRequests,
  requestAccess,
} from "@/server/services/access-requests";
import { createOwner, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("access requests (D-032)", () => {
  it("validates and stores a request, refreshing it on resubmit", async () => {
    expect(await requestAccess({ email: "not-an-email" })).toEqual({
      ok: false,
      error: "invalid_email",
    });
    expect(await requestAccess({ email: "a@b.co", xHandle: "bad handle!" })).toEqual({
      ok: false,
      error: "invalid_handle",
    });
    expect(await requestAccess({ email: "a@b.co", message: "x".repeat(501) })).toEqual({
      ok: false,
      error: "too_long",
    });

    expect(await requestAccess({ email: " Fan@Example.com ", xHandle: "@creator_1" })).toEqual({
      ok: true,
      data: null,
    });
    await requestAccess({ email: "fan@example.com", xHandle: "creator_2", message: "hi" });

    const list = await listAccessRequests();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      email: "fan@example.com",
      xHandle: "creator_2",
      message: "hi",
    });
  });

  it("does not store requests from people who already have access", async () => {
    const owner = await createOwner("a");
    await inviteUser(owner.userId, "friend@example.com");

    expect((await requestAccess({ email: "friend@example.com" })).ok).toBe(true);
    expect((await requestAccess({ email: "owner-a@example.com" })).ok).toBe(true);
    expect(await listAccessRequests()).toEqual([]);
  });

  it("approve invites the email and removes the request; dismiss just removes it", async () => {
    const owner = await createOwner("a");
    await requestAccess({ email: "one@example.com" });
    await requestAccess({ email: "two@example.com" });
    const [first, second] = await listAccessRequests();

    expect(await approveRequest(second?.id ?? "", owner.userId)).toEqual({
      ok: true,
      data: { email: "one@example.com" },
    });
    expect(await hasAppAccess("one@example.com")).toBe(true);
    expect(await dismissRequest(first?.id ?? "")).toEqual({ ok: true, data: null });
    expect(await hasAppAccess("two@example.com")).toBe(false);
    expect(await listAccessRequests()).toEqual([]);
    expect(await dismissRequest("missing")).toEqual({ ok: false, error: "not_found" });
  });
});
