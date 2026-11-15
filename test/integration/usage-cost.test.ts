// Estimated cost in the usage view. The usage log cannot be cleared from a test and the dollar sums
// add up across the whole file, so the tests run in this order and each expected sum is the literal
// total after the tests above it. Earlier test files only make calls to the mock address, which have
// no estimated cost.
//
// A priced call needs the API address https://api.openai.com/v1. The test-only switch
// QUICKK_TEST_OPENAI_REDIRECT sends that one address to the mock server. The usage entry still
// stores the configured address.

import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

const OPENAI = "https://api.openai.com/v1";
const SWITCH = "QUICKK_TEST_OPENAI_REDIRECT";
const PERIODS = ["Today", "This month", "All time"];
const REPLY = "```js\nconst a = 2;\n```";

let server: MockServer;

/** Runs QuickK: Show Usage and returns the text of the tab it focused. */
async function showUsage(): Promise<string> {
  await vscode.commands.executeCommand("quickk.showUsage");
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, "no active editor after QuickK: Show Usage");
  return editor.document.getText().replace(/\r\n/g, "\n");
}

/** The lines of one block ("Today", "This month" or "All time") as title-to-text pairs. */
function sums(viewText: string, title: string): Record<string, string> {
  const result: Record<string, string> = {};
  const start = viewText.split("\n").indexOf(title);
  assert.ok(start >= 0, `no block called ${title}`);
  for (const line of viewText.split("\n").slice(start + 1)) {
    if (line === "") {
      break;
    }
    const [name, value] = line.split(": ");
    result[name] = value;
  }
  return result;
}

/** The lines under "Calls" for one model, newest first. */
function linesOf(viewText: string, model: string): string[] {
  return viewText
    .split("\nCalls\n")[1]
    .split("\n")
    .filter((line) => line.includes(`  ${model}  `));
}

/** Runs an edit of one selected line, with this model and API address, until its call has ended. */
async function editWith(model: string, baseUrl: string): Promise<void> {
  const settings = vscode.workspace.getConfiguration("quickk");
  await settings.update("model", model, vscode.ConfigurationTarget.Global);
  await settings.update("baseUrl", baseUrl, vscode.ConfigurationTarget.Global);
  try {
    const doc = await vscode.workspace.openTextDocument({ content: "const a = 1;\n", language: "javascript" });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, doc.lineAt(0).text.length);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "Make it a constant." });
  } finally {
    await settings.update("model", undefined, vscode.ConfigurationTarget.Global);
  }
}

/** A priced call: the OpenAI address, with the switch on only while the command runs. */
async function pricedEdit(model: string, usage: Record<string, unknown>): Promise<void> {
  server.respond = () => ({ content: REPLY, usage });
  process.env[SWITCH] = server.url;
  try {
    await editWith(model, OPENAI);
  } finally {
    delete process.env[SWITCH];
  }
}

/** The line a call just added for this model. */
async function newLine(
  model: string,
  call: () => Promise<void>
): Promise<{ line: string; view: string; before: string }> {
  const before = await showUsage();
  await call();
  const view = await showUsage();
  const lines = linesOf(view, model);
  assert.strictEqual(lines.length, linesOf(before, model).length + 1, `no new line for ${model}`);
  return { line: lines[0], view, before };
}

/** How much one number in a block grew between two views. */
function growth(before: string, after: string, title: string, name: string): number {
  return Number(sums(after, title)[name]) - Number(sums(before, title)[name]);
}

function assertSums(view: string, name: string, expected: string): void {
  for (const period of PERIODS) {
    assert.strictEqual(sums(view, period)[name], expected, `${period}: ${name}`);
  }
}

function assertGrowth(before: string, after: string, name: string, expected: number): void {
  for (const period of PERIODS) {
    assert.strictEqual(growth(before, after, period, name), expected, `${period}: ${name}`);
  }
}

describe("usage view estimated cost", function () {
  before(async () => {
    const extension = vscode.extensions.getExtension("quickk.quickk");
    assert.ok(extension, "extension not found");
    await extension.activate();
    server = await startMockServer(() => ({ content: REPLY }));
    // The OpenAI address needs a key. This stores a fake one the way QuickK: Set Up does.
    const folder = path.join(os.tmpdir(), "quickk-cost-test");
    await vscode.commands.executeCommand("quickk.setUp", {
      argvPath: path.join(folder, "argv.json"),
      keybindingsPath: path.join(folder, "keybindings.json"),
      answers: { apiKey: "sk-cost-test" },
    });
  });

  afterEach(async () => {
    delete process.env[SWITCH];
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  after(async () => {
    await vscode.workspace.getConfiguration("quickk").update("baseUrl", undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("quickk.clearApiKey");
    await server.close();
  });

  it("prices gpt-4o-mini: 10,000 input and 1,000 output tokens show $0.0021", async () => {
    const { line, view, before } = await newLine("gpt-4o-mini", () =>
      pricedEdit("gpt-4o-mini", { prompt_tokens: 10000, completion_tokens: 1000 })
    );

    assert.match(line, / {2}edit {2}gpt-4o-mini {2}input 10000 {2}output 1000 {2}\$0\.0021$/);
    assertSums(view, "Estimated cost", "$0.0021");
    assertGrowth(before, view, "Entries with no estimated cost", 0);
  });

  it("prices cached input at the cached price: 1,000 input, 400 of them cached, no output show $0.0001", async () => {
    const { line, view } = await newLine("gpt-4o-mini", () =>
      pricedEdit("gpt-4o-mini", {
        prompt_tokens: 1000,
        completion_tokens: 0,
        prompt_tokens_details: { cached_tokens: 400 },
      })
    );

    assert.match(line, / {2}input 1000 {2}output 0 {2}\$0\.0001$/);
    // 0.0021 + 0.00012 = 0.00222
    assertSums(view, "Estimated cost", "$0.0022");
  });

  it("prices a listed model with no cached price at the input price, whatever is cached", async () => {
    // gpt-5-pro: 1000 x 15 + 100 x 120 = 27,000 millionths of a dollar.
    const { line, view } = await newLine("gpt-5-pro", () =>
      pricedEdit("gpt-5-pro", {
        prompt_tokens: 1000,
        completion_tokens: 100,
        prompt_tokens_details: { cached_tokens: 400 },
      })
    );

    assert.match(line, / {2}input 1000 {2}output 100 {2}\$0\.0270$/);
    // 0.00222 + 0.027 = 0.02922
    assertSums(view, "Estimated cost", "$0.0292");
  });

  it("keeps the token counts and shows no estimated cost when the cached count is larger than the input count", async () => {
    const { line, view, before } = await newLine("gpt-4o-mini", () =>
      pricedEdit("gpt-4o-mini", {
        prompt_tokens: 100,
        completion_tokens: 10,
        prompt_tokens_details: { cached_tokens: 200 },
      })
    );

    assert.match(line, / {2}input 100 {2}output 10 {2}unknown$/);
    assertSums(view, "Estimated cost", "$0.0292");
    assertGrowth(before, view, "Entries with no estimated cost", 1);
  });
});
