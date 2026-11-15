// Every kind of QuickK call, seen through QuickK: Show Usage. The tab text is the behavior under test.
// Other test files also write to the usage log, so each test uses its own model name and counts
// only the lines that show it.

import * as assert from "assert";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";
import type { QuickKApi } from "../../src/extension";

const ORIGINAL = "const a = 1;\n";
const CODE_REPLY = "```js\nconst a = 2;\n```";

let server: MockServer;
let api: QuickKApi;
let terminal: vscode.Terminal | undefined;

/** The terminal call needs an open terminal. It is made once and kept for the later terminal tests. */
async function ensureTerminal(): Promise<void> {
  if (!terminal) {
    terminal = vscode.window.createTerminal({ name: "quickk-usage-test" });
    terminal.show();
    await sleep(1500);
  }
}

/** Runs QuickK: Show Usage and returns the text of the tab it focused. */
async function showUsage(): Promise<string> {
  await vscode.commands.executeCommand("quickk.showUsage");
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, "no active editor after QuickK: Show Usage");
  return editor.document.getText().replace(/\r\n/g, "\n");
}

/** The lines under "Calls" that show this model, newest first. */
async function callsOf(model: string): Promise<string[]> {
  const view = await showUsage();
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  return view
    .split("\nCalls\n")[1]
    .split("\n")
    .filter((line) => line.includes(`  ${model}  `));
}

async function useModel(model: string): Promise<void> {
  await vscode.workspace.getConfiguration("quickk").update("model", model, vscode.ConfigurationTarget.Global);
}

async function openDoc(content = ORIGINAL): Promise<{ doc: vscode.TextDocument; editor: vscode.TextEditor }> {
  const doc = await vscode.workspace.openTextDocument({ content, language: "javascript" });
  const editor = await vscode.window.showTextDocument(doc);
  return { doc, editor };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("usage entries for every kind of call", function () {
  this.timeout(30000);

  before(async () => {
    const extension = vscode.extensions.getExtension("quickk.quickk");
    assert.ok(extension, "extension not found");
    api = (await extension.activate()) as QuickKApi;
    server = await startMockServer(() => ({ content: CODE_REPLY }));
    await vscode.workspace.getConfiguration("quickk").update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
  });

  beforeEach(() => {
    server.respond = () => ({ content: CODE_REPLY });
  });

  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  after(async () => {
    terminal?.dispose();
    await vscode.workspace.getConfiguration("quickk").update("model", undefined, vscode.ConfigurationTarget.Global);
    await server.close();
  });

  it("lists a question as task kind question, with unknown tokens and unknown cost", async () => {
    await useModel("question-model");
    server.respond = () => ({ content: "It sets a to one." });
    const { doc } = await openDoc();
    await vscode.commands.executeCommand("quickk.editor");
    await api.simulate(doc.uri, { type: "submit", text: "What does this do?", mode: "question" });

    const lines = await callsOf("question-model");
    assert.strictEqual(lines.length, 1);
    assert.match(
      lines[0],
      /^\d{4}-\d\d-\d\d \d\d:\d\d {2}question {2}question-model {2}input unknown {2}output unknown {2}unknown$/
    );
  });

  it("lists a terminal command as task kind terminal once the command text came back", async () => {
    await useModel("terminal-model");
    await ensureTerminal();
    server.respond = () => ({ content: "echo hi" });

    await vscode.commands.executeCommand("quickk.terminal", { instruction: "say hi" });

    const lines = await callsOf("terminal-model");
    assert.strictEqual(lines.length, 1);
    assert.match(
      lines[0],
      /^\d{4}-\d\d-\d\d \d\d:\d\d {2}terminal {2}terminal-model {2}input unknown {2}output unknown {2}unknown$/
    );
  });
});
