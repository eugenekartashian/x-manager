import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// Shared Sentry settings (M6.4): errors only, and nothing that could identify a user or leak
// a credential. X tokens are decrypted in server memory — local variables and request data
// must never be attached to events. See docs/security.md.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Strips the query string: the X OAuth callback carries a one-time `code` and `state`. */
function withoutQuery(url: string | undefined): string | undefined {
  return url?.split("?")[0]?.split("#")[0];
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = { url: withoutQuery(event.request.url), method: event.request.method };
  }
  delete event.user;
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ["url", "from", "to"]) {
    if (typeof data[key] === "string") data[key] = withoutQuery(data[key]);
  }
  return { ...breadcrumb, data };
}

export const sentryOptions = {
  dsn,
  // Only in deployed builds with a DSN; local dev and tests never send anything.
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0, // errors only — no performance traces, no session replay
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
