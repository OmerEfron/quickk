// Token counts in the usage view. The usage log cannot be cleared from a test, so every test uses its
// own model name to find its line, and checks the sums by how much they grew.

import * as assert from "assert";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

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

const PERIODS = ["Today", "This month", "All time"];

/** How much one number in a block grew between two views. */
function growth(before: string, after: string, title: string, name: string): number {
  return Number(sums(after, title)[name]) - Number(sums(before, title)[name]);
}

/** The lines under "Calls" for one model. */
function linesOf(viewText: string, model: string): string[] {
  return viewText
    .split("\nCalls\n")[1]
    .split("\n")
    .filter((line) => line.includes(`  ${model}  `));
}

/** Runs an edit of one selected line, with this model, until its call has ended. */
async function editWith(model: string, instruction = "Make it a constant."): Promise<void> {
  const settings = vscode.workspace.getConfiguration("quickk");
  await settings.update("model", model, vscode.ConfigurationTarget.Global);
  try {
    const doc = await vscode.workspace.openTextDocument({ content: "const a = 1;\n", language: "javascript" });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, doc.lineAt(0).text.length);
    await vscode.commands.executeCommand("quickk.editor", { instruction });
  } finally {
    await settings.update("model", undefined, vscode.ConfigurationTarget.Global);
  }
}

describe("usage view token counts", function () {
  before(async () => {
    const extension = vscode.extensions.getExtension("quickk.quickk");
    assert.ok(extension, "extension not found");
    await extension.activate();
    server = await startMockServer(() => ({ content: "```js\nconst a = 2;\n```" }));
    await vscode.workspace.getConfiguration("quickk").update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
  });

  beforeEach(() => {
    server.respond = () => ({ content: "```js\nconst a = 2;\n```" });
  });

  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  after(async () => {
    await server.close();
  });

  it("shows counts the API sent on the line and adds them into every sum", async () => {
    const before = await showUsage();
    server.respond = () => ({
      content: "```js\nconst a = 2;\n```",
      usage: { prompt_tokens: 1200, completion_tokens: 345, total_tokens: 1545 },
    });

    await editWith("known-counts-model");

    const after = await showUsage();
    const lines = linesOf(after, "known-counts-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], / {2}edit {2}known-counts-model {2}input 1200 {2}output 345 {2}unknown$/);
    for (const period of PERIODS) {
      assert.strictEqual(growth(before, after, period, "Input tokens"), 1200, period);
      assert.strictEqual(growth(before, after, period, "Output tokens"), 345, period);
      assert.strictEqual(growth(before, after, period, "Entries missing token counts"), 0, period);
      assert.strictEqual(growth(before, after, period, "Entries with no estimated cost"), 1, period);
    }
  });

  it("asks a streaming call to include token counts", async () => {
    await editWith("asks-for-counts-model");
    assert.strictEqual(server.requests[server.requests.length - 1].stream, true);
    assert.deepStrictEqual(server.requests[server.requests.length - 1].stream_options, { include_usage: true });
  });

  it("reads the counts of a non-streaming JSON body the same way", async () => {
    const before = await showUsage();
    server.respond = () => ({
      json: true,
      content: "```js\nconst a = 2;\n```",
      usage: { prompt_tokens: 80, completion_tokens: 9 },
    });

    await editWith("json-body-model");

    const after = await showUsage();
    const lines = linesOf(after, "json-body-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], / {2}input 80 {2}output 9 {2}unknown$/);
    assert.strictEqual(growth(before, after, "All time", "Input tokens"), 80);
    assert.strictEqual(growth(before, after, "All time", "Output tokens"), 9);
  });

  it("keeps a cached split off the line and counts every prompt token as input", async () => {
    server.respond = () => ({
      content: "```js\nconst a = 2;\n```",
      usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 400 } },
    });

    await editWith("split-counts-model");

    const lines = linesOf(await showUsage(), "split-counts-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], / {2}input 1000 {2}output 50 {2}unknown$/);
    assert.ok(!lines[0].includes("400"));
    assert.ok(!lines[0].includes("cached"));
  });

  it("shows a missing count as unknown, counts the entry as missing token counts, and still adds the known count", async () => {
    const before = await showUsage();
    server.respond = () => ({ content: "```js\nconst a = 2;\n```", usage: { completion_tokens: 20 } });

    await editWith("output-only-model");

    const after = await showUsage();
    const lines = linesOf(after, "output-only-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], / {2}input unknown {2}output 20 {2}unknown$/);
    for (const period of PERIODS) {
      assert.strictEqual(growth(before, after, period, "Input tokens"), 0, period);
      assert.strictEqual(growth(before, after, period, "Output tokens"), 20, period);
      assert.strictEqual(growth(before, after, period, "Entries missing token counts"), 1, period);
    }
  });

  it("treats a count that is not a non-negative whole number as unknown", async () => {
    const before = await showUsage();
    for (const [model, usage] of [
      ["negative-count-model", { prompt_tokens: -5, completion_tokens: 7 }],
      ["fraction-count-model", { prompt_tokens: 7.5, completion_tokens: 7 }],
      ["text-count-model", { prompt_tokens: "12", completion_tokens: 7 }],
      ["null-count-model", { prompt_tokens: null, completion_tokens: 7 }],
    ] as const) {
      server.respond = () => ({ content: "```js\nconst a = 2;\n```", usage });
      await editWith(model);
    }

    const after = await showUsage();
    for (const model of ["negative", "fraction", "text", "null"]) {
      const lines = linesOf(after, `${model}-count-model`);
      assert.strictEqual(lines.length, 1, model);
      assert.match(lines[0], / {2}input unknown {2}output 7 {2}unknown$/, model);
    }
    assert.strictEqual(growth(before, after, "All time", "Input tokens"), 0);
    assert.strictEqual(growth(before, after, "All time", "Output tokens"), 28);
    assert.strictEqual(growth(before, after, "All time", "Entries missing token counts"), 4);
  });

  it("keeps zero as a known count", async () => {
    server.respond = () => ({ content: "```js\nconst a = 2;\n```", usage: { prompt_tokens: 0, completion_tokens: 0 } });

    await editWith("zero-count-model");

    const lines = linesOf(await showUsage(), "zero-count-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], / {2}input 0 {2}output 0 {2}unknown$/);
  });
});
