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
