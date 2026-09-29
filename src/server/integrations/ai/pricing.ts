// Claude API prices in micro-dollars per token (docs: $ per 1M tokens → micros per token).
// Unknown models (e.g. a server-side fallback) are priced at the Opus 5 rate: never under-count.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function aiCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? { input: 5, output: 25 };
  return inputTokens * price.input + outputTokens * price.output;
}
