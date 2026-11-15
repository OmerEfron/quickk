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
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
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
  return (call.inputTokens * price.input + call.outputTokens * price.output) / 1_000_000;
}
