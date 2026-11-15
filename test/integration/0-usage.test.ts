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

describe("usage view", function () {
  before(async () => {
    const extension = vscode.extensions.getExtension("quickk.quickk");
    assert.ok(extension, "extension not found");
    await extension.activate();
    server = await startMockServer(() => ({ content: "```js\nconst a = 1;\n```" }));
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
});
