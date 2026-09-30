import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { createUser, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const hooks = auth.options.databaseHooks;

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing auth hook: ${name}`);
  return value;
}

const beforeUserCreate = required(hooks?.user?.create?.before, "user.create.before");
const afterUserCreate = required(hooks?.user?.create?.after, "user.create.after");
const beforeSessionCreate = required(hooks?.session?.create?.before, "session.create.before");

function userDraft(email: string) {
  const now = new Date();
  return {
    id: "user-a",
    email,
    name: "Owner A",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
}

function sessionDraft(userId: string) {
  const now = new Date();
  return {
    id: "session-1",
    userId,
    token: "token-1",
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
  };
}

// SUPERADMIN_EMAILS in tests: owner-a@example.com. Everyone else needs an invite (D-025).

describe("sign-up access", () => {
  it("rejects a Google account without an invite", async () => {
    await expect(beforeUserCreate(userDraft("stranger@gmail.com"))).rejects.toThrow("not allowed");
  });

  it("accepts the superadmin email regardless of case", async () => {
    await expect(beforeUserCreate(userDraft("Owner-A@Example.com"))).resolves.toBeUndefined();
  });

  it("accepts an invited email regardless of case", async () => {
    await prisma.accessInvite.create({ data: { email: "friend@example.com" } });

    await expect(beforeUserCreate(userDraft("Friend@Example.com"))).resolves.toBeUndefined();
  });

  it("rejects a revoked invite", async () => {
    await prisma.accessInvite.create({
      data: { email: "friend@example.com", revokedAt: new Date() },
    });

    await expect(beforeUserCreate(userDraft("friend@example.com"))).rejects.toThrow("not allowed");
  });

  it("creates the user's workspace right after sign-up", async () => {
    const user = await createUser("user-a", "owner-a@example.com", "Owner A");

    await afterUserCreate(user);

    const workspace = await prisma.workspace.findUnique({ where: { ownerId: "user-a" } });
    expect(workspace?.name).toBe("Owner A");
  });
});

describe("sign-in access", () => {
  it("blocks a new session for a user without an invite", async () => {
    await createUser("user-x", "removed@example.com");

    await expect(beforeSessionCreate(sessionDraft("user-x"))).rejects.toThrow("not allowed");
  });

  it("blocks a session for an unknown user id", async () => {
    await expect(beforeSessionCreate(sessionDraft("ghost"))).rejects.toThrow("not allowed");
  });

  it("allows the superadmin and syncs their role", async () => {
    await createUser("user-a", "owner-a@example.com");

    await expect(beforeSessionCreate(sessionDraft("user-a"))).resolves.toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: "user-a" } });
    expect(user.role).toBe("SUPERADMIN");
  });

  it("allows an invited user as a regular user", async () => {
    await createUser("user-f", "friend@example.com");
    await prisma.accessInvite.create({ data: { email: "friend@example.com" } });

    await expect(beforeSessionCreate(sessionDraft("user-f"))).resolves.toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: "user-f" } });
    expect(user.role).toBe("USER");
  });
});
