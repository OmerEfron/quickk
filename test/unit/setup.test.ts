import * as assert from "assert";
import * as path from "path";
import { argvPath } from "../../src/setup/argv";
import { offerSetupOnce, runSetup, SetupState, SetupStep } from "../../src/setup/runner";

function memoryState(): SetupState {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string) => values.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

function step(id: string, answer: boolean, done = false): SetupStep {
  return { id, isDone: async () => done, ask: async () => answer };
}

describe("Setup runner", () => {
  it("asks the steps that are not done, in order", async () => {
    const asked = await runSetup([step("a", true), step("b", true, true), step("c", false)], memoryState(), false);
    assert.deepStrictEqual(asked, ["a", "c"]);
  });

  it("does not ask a declined step again automatically, but a manual run does", async () => {
    const state = memoryState();
    await runSetup([step("key", false)], state, false);

    assert.deepStrictEqual(await runSetup([step("key", false)], state, true), []);
    assert.deepStrictEqual(await runSetup([step("key", true)], state, false), ["key"]);
  });

  it("asks a step automatically again once it was accepted after a decline", async () => {
    const state = memoryState();
    await runSetup([step("key", false)], state, false);
    await runSetup([step("key", true)], state, false);

    assert.deepStrictEqual(await runSetup([step("key", false)], state, true), ["key"]);
  });

  it("offers Setup on the first start only", async () => {
    const state = memoryState();
    let offers = 0;
    const offer = () => {
      offers++;
    };
    await offerSetupOnce(state, offer);
    await offerSetupOnce(state, offer);
    assert.strictEqual(offers, 1);
  });
});

describe("argv.json location", () => {
  it("follows the application name", () => {
    assert.strictEqual(argvPath("Cursor", "/home/me"), path.join("/home/me", ".cursor", "argv.json"));
    assert.strictEqual(argvPath("Visual Studio Code", "/home/me"), path.join("/home/me", ".vscode", "argv.json"));
    assert.strictEqual(
      argvPath("Visual Studio Code - Insiders", "/home/me"),
      path.join("/home/me", ".vscode-insiders", "argv.json")
    );
  });
});
