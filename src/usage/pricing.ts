// The price list and the estimated cost of one call. This file must not import vscode.

import { sameApiAddress, OPENAI_API_ADDRESS } from "../provider/openaiCompatible";

/** US dollars per 1,000,000 tokens. */
interface Price {
  input: number;
  output: number;
  cachedInput?: number;
}

/** Standard chat prices, snapshot of 15 Nov 2026. */
const PRICE_LIST: Record<string, Price> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "gpt-4o": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4.1": { input: 2, output: 8, cachedInput: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
  "gpt-5": { input: 1.25, output: 10, cachedInput: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2, cachedInput: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cachedInput: 0.005 },
  "gpt-5-pro": { input: 15, output: 120 },
  "gpt-5.1": { input: 1.25, output: 10, cachedInput: 0.125 },
  "gpt-5.2": { input: 1.75, output: 14, cachedInput: 0.175 },
  "gpt-5.2-pro": { input: 21, output: 168 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cachedInput: 0.075 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, cachedInput: 0.02 },
  "o3": { input: 2, output: 8, cachedInput: 0.5 },
  "o3-pro": { input: 20, output: 80 },
  "gpt-5.3-codex": { input: 1.75, output: 14, cachedInput: 0.175 },
  "gpt-5-search-api": { input: 1.25, output: 10, cachedInput: 0.125 },
  "chat-latest": { input: 5, output: 30, cachedInput: 0.5 },
  "gpt-6-astra-law": { input: 10, output: 50, cachedInput: 1 },
};

export interface PricedCall {
  model: string;
  apiAddress: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

/** The full estimated cost in dollars, or null when the call has none. */
export function estimateCost(call: PricedCall): number | null {
  if (!sameApiAddress(call.apiAddress, OPENAI_API_ADDRESS)) {
    return null;
  }
  const price = Object.prototype.hasOwnProperty.call(PRICE_LIST, call.model) ? PRICE_LIST[call.model] : undefined;
  if (!price || call.inputTokens === null || call.outputTokens === null) {
    return null;
  }
  // A cached split bills the cached part at the cached price. Without a split, or without a cached
  // price, every input token uses the input price.
  const cached = price.cachedInput === undefined ? 0 : (call.cachedInputTokens ?? 0);
  const cachedPrice = price.cachedInput ?? 0;
  return ((call.inputTokens - cached) * price.input + cached * cachedPrice + call.outputTokens * price.output) / 1_000_000;
}
