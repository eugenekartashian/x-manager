// Estimated X API prices in micro-dollars, from https://docs.x.com/x-api/getting-started/pricing
// (fetched 2026-09-28). UNVERIFIED mapping per endpoint — reconcile with Console usage.
export const X_PRICE_MICROS = {
  userRead: 10_000, // GET /2/users/me — "Users: $0.010 per resource"
} as const;

export type XBillableOperation = keyof typeof X_PRICE_MICROS;
