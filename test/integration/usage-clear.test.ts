// Tests for QuickK: Clear Usage. They read the usage view, like 0-usage.test.ts does.

import * as assert from "assert";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

const NO_CALLS = "There are no calls yet.";
const QUESTION = "Delete the whole QuickK usage log?";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs an edit of one selected line until its call has ended. */
async function editSelection(instruction: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content: "const a = 1;\n", language: "javascript" });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(0, 0, 0, doc.lineAt(0).text.length);
  await vscode.commands.executeCommand("quickk.editor", { instruction });
}

/** Answers the confirm dialog of QuickK: Clear Usage and runs the command. Returns what the dialog asked. */
async function clearUsage(answer: string | undefined): Promise<string[]> {
  const asked: string[] = [];
  const original = vscode.window.showWarningMessage;
  (vscode.window as any).showWarningMessage = async (message: string) => {
    asked.push(message);
    return answer;
  };
  try {
    await vscode.commands.executeCommand("quickk.clearUsage");
  } finally {
    (vscode.window as any).showWarningMessage = original;
  }
  return asked;
}

describe("clear usage", function () {
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

  it("deletes every entry when the user confirms, and Show Usage then shows the empty log", async () => {
    await editSelection("First call.");
    await editSelection("Second call.");
    assert.ok(callLines(await showUsage()).length >= 2);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    const asked = await clearUsage("Delete");
    assert.deepStrictEqual(asked, [QUESTION]);

    // The log is saved in the background and VS Code can put an older copy back for a moment.
    await sleep(1500);
    const view = await showUsage();
    assert.ok(view.endsWith(`Calls\n${NO_CALLS}\n`), view);
  });
});
