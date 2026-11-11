import * as assert from "assert";
import { inlinePromptHtml } from "../../src/ui/inlinePromptHtml";

describe("inline prompt page", () => {
  it("never focuses without preventScroll (a plain focus() scrolls the editor sideways)", () => {
    const calls = inlinePromptHtml("n").match(/\.focus\([^)]*\)/g) ?? [];
    assert.ok(calls.length > 0);
    for (const call of calls) {
      assert.ok(call.includes("preventScroll: true"), `unsafe call: ${call}`);
    }
  });
});
