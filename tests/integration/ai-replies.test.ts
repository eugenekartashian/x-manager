import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { AI_DAILY_LIMIT, AI_OPERATION, suggestIdeasForPost } from "@/server/services/ai-replies";
import { addTemplate, loadTargetPosts } from "@/server/services/replies";
import { addTargets, listTargets } from "@/server/services/targets";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { claudeReply, fakeX, openAiReply, postsReply, usersByReply } from "../helpers/fake-x";

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

async function setup(suffix: "a" | "b" = "a") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `me-${suffix}`,
    accessToken: `t-${suffix}`,
  });
  withFakeX({ usersBy: usersByReply({ alex: { id: `${suffix}-u1` } }) });
  await addTargets(owner.workspaceId, "alex", T0);
  const target = (await listTargets(owner.workspaceId, "recent"))[0];
  if (!target) throw new Error("setup");
  withFakeX({ posts: () => postsReply(["p1"]) });
  await loadTargetPosts(owner.workspaceId, target.id, T0);
  return { workspaceId: owner.workspaceId, targetId: target.id };
}

describe("AI reply ideas", () => {
  it("asks Claude with the post as untrusted data and returns validated ideas", async () => {
    const { workspaceId, targetId } = await setup();
    await addTemplate(workspaceId, "Fire 🔥");
    const x = withFakeX({
      anthropic: () => claudeReply({ ideas: ["Love this 🔥", "Great shot", "Bold move 😈"] }),
    });

    const result = await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0);

    expect(result).toEqual({ ok: true, data: ["Love this 🔥", "Great shot", "Bold move 😈"] });
    const call = x.calls.find((item) => item.url.hostname === "api.anthropic.com");
    const body = call?.json as {
      model: string;
      fallbacks: string;
      output_config: { effort: string; format: { type: string } };
      system: string;
      messages: { content: string }[];
      tools?: unknown;
    };
    expect(body.model).toBe("claude-opus-5");
    expect(body.fallbacks).toBe("default");
    expect(call?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(body.tools).toBeUndefined(); // the model has no tools — it cannot act
    expect(body.system).toContain("untrusted data");
    expect(body.messages[0]?.content).toContain("<post>Post p1</post>");
    expect(body.messages[0]?.content).toContain("<example>Fire 🔥</example>");
    // Cost: 400 in × $5/M + 120 out × $25/M = 2_000 + 3_000 micros.
    const usage = await prisma.externalUsage.findFirstOrThrow({
      where: { workspaceId, operation: AI_OPERATION },
    });
    expect([usage.provider, usage.costMicros]).toEqual(["AI", 5_000n]);
  });

  it("rejects malformed model output", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({ anthropic: () => claudeReply({ ideas: [] }) });

    expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
      ok: false,
      error: "ai_unavailable",
    });
  });

  it("reports a refusal without recording spend", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({ anthropic: () => claudeReply(null, { stopReason: "refusal" }) });

    expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
      ok: false,
      error: "ai_declined",
    });
    expect(
      await prisma.externalUsage.count({ where: { workspaceId, operation: AI_OPERATION } }),
    ).toBe(0);
  });

  it("only works on loaded posts of the caller's own targets", async () => {
    const a = await setup("a");
    const b = await setup("b");
    const x = withFakeX({});

    expect(
      await suggestIdeasForPost(b.workspaceId, { targetId: a.targetId, xPostId: "p1" }, T0),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await suggestIdeasForPost(a.workspaceId, { targetId: a.targetId, xPostId: "999" }, T0),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("stops at the monthly budget and the daily AI limit without calling Claude", async () => {
    const { workspaceId, targetId } = await setup();
    await prisma.externalUsage.createMany({
      data: Array.from({ length: AI_DAILY_LIMIT }, () => ({
        workspaceId,
        provider: "AI" as const,
        operation: AI_OPERATION,
        units: 1,
        costMicros: 1n,
        occurredAt: T0,
      })),
    });
    const x = withFakeX({});

    expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
      ok: false,
      error: "ai_daily_limit",
    });

    await prisma.externalUsage.create({
      data: {
        workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 5_000_000n,
        occurredAt: T0,
      },
    });
    expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
      ok: false,
      error: "budget_exceeded",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("maps API errors to a retryable message", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({
      anthropic: () => ({
        status: 529,
        body: { type: "error", error: { type: "overloaded_error", message: "x" } },
      }),
    });

    expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
      ok: false,
      error: "ai_unavailable",
    });
  });
});

describe("AI reply ideas via OpenAI", () => {
  const original = env.AI_PROVIDER;
  beforeEach(() => {
    env.AI_PROVIDER = "openai";
  });
  afterEach(() => {
    env.AI_PROVIDER = original;
  });

  it("uses the Responses API with a strict JSON schema and the default gpt-5-mini", async () => {
    const { workspaceId, targetId } = await setup();
    const x = withFakeX({ openai: () => openAiReply({ ideas: ["So good 🔥", "Legend"] }) });

    const result = await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0);

    expect(result).toEqual({ ok: true, data: ["So good 🔥", "Legend"] });
    const call = x.calls.find((item) => item.url.hostname === "api.openai.com");
    const body = call?.json as {
      model: string;
      instructions: string;
      input: string;
      reasoning: { effort: string };
      text: { format: { type: string; strict: boolean; name: string } };
      tools?: unknown;
    };
    expect(call?.url.pathname).toBe("/v1/responses");
    expect(body.model).toBe("gpt-5-mini");
    expect(body.reasoning.effort).toBe("low");
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "reply_ideas",
    });
    expect(body.tools).toBeUndefined();
    expect(body.instructions).toContain("untrusted data");
    expect(body.input).toContain("<post>Post p1</post>");
    // 500 in × $0.25/M + 300 out × $2/M = 125 + 600 micros (dated snapshot id priced as gpt-5-mini).
    const usage = await prisma.externalUsage.findFirstOrThrow({
      where: { workspaceId, operation: AI_OPERATION },
    });
    expect(usage.costMicros).toBe(725n);
  });

  it("reports an OpenAI refusal without recording spend", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({ openai: () => openAiReply(null, { refusal: true }) });

    expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
      ok: false,
      error: "ai_declined",
    });
    expect(
      await prisma.externalUsage.count({ where: { workspaceId, operation: AI_OPERATION } }),
    ).toBe(0);
  });

  it("is off when the selected provider has no key", async () => {
    const { workspaceId, targetId } = await setup();
    const key = env.OPENAI_API_KEY;
    env.OPENAI_API_KEY = undefined;
    try {
      expect(await suggestIdeasForPost(workspaceId, { targetId, xPostId: "p1" }, T0)).toEqual({
        ok: false,
        error: "ai_not_configured",
      });
    } finally {
      env.OPENAI_API_KEY = key;
    }
  });
});
