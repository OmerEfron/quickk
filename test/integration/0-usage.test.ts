// The "0-" prefix keeps this file first (see index.ts). The first test needs a usage log that no
// other test has written to yet, because there is no way to clear the log from here.

import * as assert from "assert";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

const WARNING = "These figures are estimates. Your provider's bill can differ.";

const EMPTY_BLOCK = [
  "Estimated cost: unknown",
  "Input tokens: 0",
  "Output tokens: 0",
  "Entries with no estimated cost: 0",
  "Entries missing token counts: 0",
].join("\n");

const EMPTY_USAGE_VIEW = [
  WARNING,
  "",
  "Today",
  EMPTY_BLOCK,
  "",
  "This month",
  EMPTY_BLOCK,
  "",
  "All time",
  EMPTY_BLOCK,
  "",
  "Calls",
  "There are no calls yet.",
  "",
].join("\n");

let server: MockServer;

/** Runs QuickK: Show Usage and returns the text of the tab it focused. */
async function showUsage(): Promise<string> {
  await vscode.commands.executeCommand("quickk.showUsage");
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, "no active editor after QuickK: Show Usage");
  return editor.document.getText().replace(/\r\n/g, "\n");
}

function usageTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.label === "QuickK Usage");
}

/** The lines under "Calls", without the empty line at the end. */
function callLines(viewText: string): string[] {
  return viewText.split("\nCalls\n")[1].split("\n").filter((line) => line !== "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(`Timed out waiting for: ${what}`);
    }
    await sleep(20);
  }
}

/** Starts an edit of one selected line against the mock server. */
async function startEdit(instruction: string): Promise<{ doc: vscode.TextDocument; running: Thenable<unknown> }> {
  const doc = await vscode.workspace.openTextDocument({ content: "const a = 1;\n", language: "javascript" });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(0, 0, 0, doc.lineAt(0).text.length);
  return { doc, running: vscode.commands.executeCommand("quickk.editor", { instruction }) };
}

/** Runs an edit until its call has ended. */
async function editSelection(instruction: string): Promise<vscode.TextDocument> {
  const { doc, running } = await startEdit(instruction);
  await running;
  return doc;
}

describe("usage view", function () {
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

  it("shows the warning, three empty sums and a no-calls line when nothing was saved", async () => {
    assert.strictEqual(await showUsage(), EMPTY_USAGE_VIEW);
  });

  it("lists an edit that returned text, with unknown tokens and unknown cost", async () => {
    await editSelection("Make it a constant.");
    const lines = callLines(await showUsage());
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /^\d{4}-\d\d-\d\d \d\d:\d\d {2}edit {2}gpt-4o-mini {2}input unknown {2}output unknown {2}unknown$/);
  });

  it("saves one entry when the user stops a call after some text came back", async () => {
    const settings = vscode.workspace.getConfiguration("quickk");
    await settings.update("model", "stopped-model", vscode.ConfigurationTarget.Global);
    server.respond = () => ({ chunks: ["```js\nconst a = 2;\nconst b = 3;\n", "const c = 4;\n```"], chunkDelayMs: 1200 });
    const before = callLines(await showUsage()).length;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    const { doc, running } = await startEdit("Stop me.");
    await until(() => doc.getText().includes("const b = 3;"), "the first lines to appear");
    await vscode.commands.executeCommand("quickk.cancel");
    await running;
    await settings.update("model", undefined, vscode.ConfigurationTarget.Global);

    const lines = callLines(await showUsage());
    assert.strictEqual(lines.length, before + 1);
    assert.match(lines[0], / {2}edit {2}stopped-model {2}/);
  });

  it("leaves no entry when the call fails before any text", async () => {
    server.respond = () => ({ status: 500, errorMessage: "boom" });
    const before = callLines(await showUsage()).length;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    await editSelection("Fail.");

    assert.strictEqual(callLines(await showUsage()).length, before);
  });

  it("leaves no entry when the user stops a call before any text", async () => {
    server.respond = () => ({ delayMs: 1500, content: "```js\nconst a = 2;\n```" });
    const before = callLines(await showUsage()).length;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    const { running } = await startEdit("Stop me early.");
    await sleep(300);
    await vscode.commands.executeCommand("quickk.cancel");
    await running;

    assert.strictEqual(callLines(await showUsage()).length, before);
  });

  it("opens one read-only tab titled QuickK Usage only when asked", async () => {
    await editSelection("Open nothing.");
    assert.strictEqual(usageTabs().length, 0);

    await showUsage();

    assert.strictEqual(usageTabs().length, 1);
    assert.strictEqual(vscode.window.tabGroups.activeTabGroup.activeTab?.label, "QuickK Usage");
    const doc = vscode.window.activeTextEditor!.document;
    const before = doc.getText();
    await vscode.commands.executeCommand("type", { text: "typed by the user" });
    assert.strictEqual(doc.getText(), before);
  });

  it("keeps an open tab as it was until Show Usage runs again, then refreshes the same tab", async () => {
    await showUsage();
    const doc = vscode.window.activeTextEditor!.document;
    const shown = doc.getText();

    await editSelection("Later call.");
    assert.strictEqual(doc.getText(), shown);

    await vscode.commands.executeCommand("quickk.showUsage");
    assert.strictEqual(callLines(doc.getText()).length, callLines(shown).length + 1);
    assert.strictEqual(usageTabs().length, 1);
  });

  it("keeps the prompt and the code out of the tab", async () => {
    await editSelection("Rename it to SECRET_PROMPT_WORDS.");
    const view = await showUsage();
    assert.ok(!view.includes("SECRET_PROMPT_WORDS"));
    assert.ok(!view.includes("const a"));
  });

  it("lists the newest call first", async () => {
    const settings = vscode.workspace.getConfiguration("quickk");
    const before = callLines(await showUsage()).length;
    await settings.update("model", "older-model", vscode.ConfigurationTarget.Global);
    await editSelection("First.");
    await settings.update("model", "newer-model", vscode.ConfigurationTarget.Global);
    await editSelection("Second.");
    await settings.update("model", undefined, vscode.ConfigurationTarget.Global);
    const lines = callLines(await showUsage());
    assert.strictEqual(lines.length, before + 2);
    assert.match(lines[0], / {2}newer-model {2}/);
    assert.match(lines[1], / {2}older-model {2}/);
  });
});
