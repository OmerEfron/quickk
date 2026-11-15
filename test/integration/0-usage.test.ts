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

/** The lines under "Calls", without the empty line at the end. */
function callLines(viewText: string): string[] {
  return viewText.split("\nCalls\n")[1].split("\n").filter((line) => line !== "");
}

/** Runs an edit of one selected line against the mock server. */
async function editSelection(instruction: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({ content: "const a = 1;\n", language: "javascript" });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(0, 0, 0, doc.lineAt(0).text.length);
  await vscode.commands.executeCommand("quickk.editor", { instruction });
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
});
