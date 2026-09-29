// AI prices in micro-dollars per token ($ per 1M tokens = micros per token), from the
// providers' pricing pages (Anthropic: claude-api skill table; OpenAI: developers.openai.com
// pricing, fetched 2026-09-29). Unknown models are priced high so spend is never under-counted.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};
const UNKNOWN_MODEL = { input: 5, output: 25 };

export function aiCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  // Providers may return a dated snapshot id (e.g. "gpt-5-mini-2025-08-07").
  const key = Object.keys(PRICES).find((name) => model === name || model.startsWith(`${name}-`));
  const price = (key && PRICES[key]) || UNKNOWN_MODEL;
  return Math.ceil(inputTokens * price.input + outputTokens * price.output);
}
