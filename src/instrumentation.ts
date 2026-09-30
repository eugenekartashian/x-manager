import * as Sentry from "@sentry/nextjs";

// Next.js instrumentation hook: loads Sentry for the current runtime (M6.4).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
