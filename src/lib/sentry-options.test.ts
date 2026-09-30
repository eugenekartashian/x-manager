import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, sentryOptions } from "./sentry-options";

describe("Sentry privacy", () => {
  it("removes query strings, cookies, headers, body and user from events", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://app.example/api/x/oauth/callback?code=SECRET&state=abc",
        method: "GET",
        cookies: { session: "s" },
        headers: { authorization: "Bearer token" },
        query_string: "code=SECRET",
        data: { text: "private" },
      },
      user: { email: "friend@example.com" },
      breadcrumbs: [{ category: "fetch", data: { url: "https://api.x.com/2/users?token=t" } }],
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request).toEqual({
      url: "https://app.example/api/x/oauth/callback",
      method: "GET",
    });
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs?.[0]?.data?.url).toBe("https://api.x.com/2/users");
    expect(JSON.stringify(scrubbed)).not.toMatch(/SECRET|Bearer|friend@|private/);
  });

  it("keeps breadcrumbs without data untouched", () => {
    expect(scrubBreadcrumb({ message: "clicked" })).toEqual({ message: "clicked" });
  });

  it("collects no personal data or local variables and sends no traces", () => {
    expect(sentryOptions.tracesSampleRate).toBe(0);
    expect(sentryOptions.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    expect(sentryOptions.enabled).toBe(false); // tests / no DSN never send
  });
});
