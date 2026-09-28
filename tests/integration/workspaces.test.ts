import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ensureWorkspaceForOwner, findWorkspaceByOwner } from "@/server/repositories/workspaces";
import { createUser, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("workspace ownership", () => {
  it("creates exactly one workspace per owner, even when called repeatedly", async () => {
    await createUser("user-a", "owner-a@example.com", "Owner A");

    const first = await ensureWorkspaceForOwner("user-a", "Owner A");
    const second = await ensureWorkspaceForOwner("user-a", "Renamed");

    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Owner A");
    expect(await prisma.workspace.count({ where: { ownerId: "user-a" } })).toBe(1);
  });

  it("survives concurrent creation for the same owner", async () => {
    await createUser("user-a", "owner-a@example.com");

    const results = await Promise.all([
      ensureWorkspaceForOwner("user-a", "A"),
      ensureWorkspaceForOwner("user-a", "A"),
    ]);

    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.workspace.count()).toBe(1);
  });

  it("returns only the caller's own workspace (no cross-workspace access)", async () => {
    await createUser("user-a", "owner-a@example.com");
    await createUser("user-b", "owner-b@example.com");
    const workspaceA = await ensureWorkspaceForOwner("user-a", "A");
    const workspaceB = await ensureWorkspaceForOwner("user-b", "B");

    expect((await findWorkspaceByOwner("user-a"))?.id).toBe(workspaceA.id);
    expect((await findWorkspaceByOwner("user-b"))?.id).toBe(workspaceB.id);
    expect(workspaceA.id).not.toBe(workspaceB.id);
  });

  it("returns null for a user without a workspace", async () => {
    expect(await findWorkspaceByOwner("unknown-user")).toBeNull();
  });

  it("falls back to a default name when the owner name is blank", async () => {
    await createUser("user-a", "owner-a@example.com");

    expect((await ensureWorkspaceForOwner("user-a", "   ")).name).toBe("My workspace");
  });

  it("deletes the workspace when its owner is deleted", async () => {
    await createUser("user-a", "owner-a@example.com");
    await ensureWorkspaceForOwner("user-a", "A");

    await prisma.user.delete({ where: { id: "user-a" } });

    expect(await prisma.workspace.count()).toBe(0);
  });
});
