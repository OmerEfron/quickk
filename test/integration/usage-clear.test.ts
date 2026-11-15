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

function usageTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.label === "QuickK Usage");
}

/** Runs a QuickK command while the input box answers with the given text. */
async function runWithInputBox(command: string, answer: string): Promise<void> {
  const original = vscode.window.showInputBox;
  (vscode.window as any).showInputBox = async () => answer;
  try {
    await vscode.commands.executeCommand(command);
  } finally {
    (vscode.window as any).showInputBox = original;
  }
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

  it("leaves every entry in place when the user dismisses the prompt", async () => {
    await editSelection("Keep me.");
    const shown = await showUsage();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    const asked = await clearUsage(undefined);
    assert.deepStrictEqual(asked, [QUESTION]);

    await sleep(1500);
    assert.strictEqual(await showUsage(), shown);
  });

  it("keeps an open usage view as it was until Show Usage runs again, then refreshes the same tab", async () => {
    await editSelection("Seen once.");
    await showUsage();
    const doc = vscode.window.activeTextEditor!.document;
    const shown = doc.getText();
    assert.ok(callLines(shown).length >= 1);

    await clearUsage("Delete");
    await sleep(300);
    assert.strictEqual(doc.getText(), shown);

    const view = await showUsage();
    assert.ok(view.endsWith(`Calls\n${NO_CALLS}\n`), view);
    assert.strictEqual(doc.getText().replace(/\r\n/g, "\n"), view);
    assert.strictEqual(usageTabs().length, 1);
  });

  it("leaves the usage log as it is when the API key is set or cleared", async () => {
    await editSelection("Before the key.");
    const shown = await showUsage();
    assert.ok(callLines(shown).length >= 1);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    await runWithInputBox("quickk.setApiKey", "sk-test-key");
    assert.strictEqual(await showUsage(), shown);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    await vscode.commands.executeCommand("quickk.clearApiKey");
    assert.strictEqual(await showUsage(), shown);
  });
});
