import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Baseline security headers for every response. See docs/security.md.
const securityHeaders = [
  // No framing: blocks clickjacking of Connect/Disconnect/Repost buttons.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  // Outgoing links reveal only our origin, never paths or query strings.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Post previews come from X's media CDN only (validated again in the X client).
    remotePatterns: [{ protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" }],
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Source maps are uploaded only when SENTRY_AUTH_TOKEN is set (build-time secret).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
});
