// Every kind of QuickK call, seen through QuickK: Show Usage. The tab text is the behavior under test.
// Other test files also write to the usage log, so each test uses its own model name and counts
// only the lines that show it.

import * as assert from "assert";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";
import type { QuickKApi } from "../../src/extension";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function until(check: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(`Timed out waiting for: ${what}`);
    }
    await sleep(20);
  }
}

async function useModel(model: string): Promise<void> {
  await vscode.workspace.getConfiguration("quickk").update("model", model, vscode.ConfigurationTarget.Global);
}

async function openDoc(content = ORIGINAL): Promise<{ doc: vscode.TextDocument; editor: vscode.TextEditor }> {
  const doc = await vscode.workspace.openTextDocument({ content, language: "javascript" });
  const editor = await vscode.window.showTextDocument(doc);
  return { doc, editor };
}

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

  // The tab line of one call, without the time.
  const KIND = (kind: string, model: string) =>
    new RegExp(`^\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d {2}${kind} {2}${model} {2}input unknown {2}output unknown {2}unknown$`);

  it("lists code generation on a blank line as task kind generate", async () => {
    await useModel("blank-model");
    const { editor } = await openDoc("\n");
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "Add a constant." });

    const lines = await callsOf("blank-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], KIND("generate", "blank-model"));
  });

  it("lists code generation below the cursor line as task kind generate", async () => {
    await useModel("insert-model");
    const { editor } = await openDoc();
    editor.selection = new vscode.Selection(0, 3, 0, 3);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "Add a constant below." });

    const lines = await callsOf("insert-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], KIND("generate", "insert-model"));
  });

  it("lists a follow-up as a second entry", async () => {
    await useModel("followup-model");
    const { editor } = await openDoc();
    editor.selection = new vscode.Selection(0, 0, 0, 12);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "First." });
    server.respond = () => ({ content: "```js\nconst a = 3;\n```" });
    await vscode.commands.executeCommand("quickk.editor", { instruction: "Second." });

    const lines = await callsOf("followup-model");
    assert.strictEqual(lines.length, 2);
    assert.match(lines[0], KIND("edit", "followup-model"));
    assert.match(lines[1], KIND("edit", "followup-model"));
  });

  it("lists 'do it' after a question as a new edit entry above the question", async () => {
    await useModel("doit-model");
    server.respond = () => ({ content: "Because it is a constant." });
    const { doc, editor } = await openDoc();
    editor.selection = new vscode.Selection(0, 0, 0, 12);
    await vscode.commands.executeCommand("quickk.editor");
    await api.simulate(doc.uri, { type: "submit", text: "Why const?", mode: "question" });
    server.respond = () => ({ content: CODE_REPLY });
    await api.simulate(doc.uri, { type: "submit", text: "Ok, rename it.", mode: "edit" });

    const lines = await callsOf("doit-model");
    assert.strictEqual(lines.length, 2);
    assert.match(lines[0], KIND("edit", "doit-model"));
    assert.match(lines[1], KIND("question", "doit-model"));
  });

  it("lists a reply that was cut off when some text came back", async () => {
    await useModel("cutoff-model");
    server.respond = () => ({ content: CODE_REPLY, finishReason: "length" });
    const { editor } = await openDoc();
    editor.selection = new vscode.Selection(0, 0, 0, 12);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "Cut me off." });

    assert.strictEqual((await callsOf("cutoff-model")).length, 1);
  });

  it("lists a reply that changed nothing when some text came back", async () => {
    await useModel("nochange-model");
    server.respond = () => ({ content: "```js\nconst a = 1;\n```" });
    const { doc, editor } = await openDoc();
    editor.selection = new vscode.Selection(0, 0, 0, 12);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "Change nothing." });
    assert.strictEqual(doc.getText().replace(/\r\n/g, "\n"), ORIGINAL);

    assert.strictEqual((await callsOf("nochange-model")).length, 1);
  });

  it("lists a terminal call when the user declines a dangerous command", async () => {
    await useModel("declined-model");
    await ensureTerminal();
    server.respond = () => ({ content: "rm -rf build" });
    const windowApi = vscode.window as any;
    const realWarning = windowApi.showWarningMessage;
    let asked = false;
    windowApi.showWarningMessage = async () => {
      asked = true;
      return undefined;
    };
    try {
      await vscode.commands.executeCommand("quickk.terminal", { instruction: "delete the build folder" });
    } finally {
      windowApi.showWarningMessage = realWarning;
    }
    assert.ok(asked, "the dangerous command must be offered to the user");

    const lines = await callsOf("declined-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], KIND("terminal", "declined-model"));
  });

  it("lists a question that the user stopped after some text came back", async () => {
    await useModel("stopq-model");
    server.respond = () => ({ chunks: ["First part. ", "Second part."], chunkDelayMs: 1200 });
    const { doc } = await openDoc();
    await vscode.commands.executeCommand("quickk.editor");
    const running = api.simulate(doc.uri, { type: "submit", text: "Explain slowly.", mode: "question" });
    await until(() => api.debug(doc.uri).answer.includes("First part."), "the first words to appear");
    await api.simulate(doc.uri, { type: "escape" });
    await running;
    assert.ok(!api.debug(doc.uri).answer.includes("Second part."), "the call must have been stopped");

    const lines = await callsOf("stopq-model");
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], KIND("question", "stopq-model"));
  });

  it("leaves no entry when a question is stopped before any text came back", async () => {
    await useModel("stopearly-model");
    server.respond = () => ({ delayMs: 1500, content: "Late answer." });
    const { doc } = await openDoc();
    await vscode.commands.executeCommand("quickk.editor");
    const running = api.simulate(doc.uri, { type: "submit", text: "Explain.", mode: "question" });
    await sleep(300);
    await api.simulate(doc.uri, { type: "escape" });
    await running;

    assert.strictEqual((await callsOf("stopearly-model")).length, 0);
  });

  it("leaves no entry when a question fails before any text", async () => {
    await useModel("failq-model");
    server.respond = () => ({ status: 500, errorMessage: "boom" });
    const { doc } = await openDoc();
    await vscode.commands.executeCommand("quickk.editor");
    await api.simulate(doc.uri, { type: "submit", text: "Why?", mode: "question" });

    assert.strictEqual((await callsOf("failq-model")).length, 0);
  });

  it("leaves no entry when a terminal call fails before any text", async () => {
    await useModel("failt-model");
    await ensureTerminal();
    server.respond = () => ({ status: 500, errorMessage: "boom" });
    const windowApi = vscode.window as any;
    const realError = windowApi.showErrorMessage;
    let failed = false;
    windowApi.showErrorMessage = async () => {
      failed = true;
      return undefined;
    };
    try {
      await vscode.commands.executeCommand("quickk.terminal", { instruction: "fail" });
    } finally {
      windowApi.showErrorMessage = realError;
    }
    assert.ok(failed, "the failure must be shown to the user");

    assert.strictEqual((await callsOf("failt-model")).length, 0);
  });

  it("keeps the prompt and the code out of the tab for every kind of call", async () => {
    await useModel("private-model");
    server.respond = () => ({ content: "Secret answer words." });
    const { doc, editor } = await openDoc("const SECRET_CODE = 1;\n");
    editor.selection = new vscode.Selection(0, 0, 0, 3);
    await vscode.commands.executeCommand("quickk.editor");
    await api.simulate(doc.uri, { type: "submit", text: "SECRET_PROMPT_WORDS?", mode: "question" });
    await ensureTerminal();
    await vscode.commands.executeCommand("quickk.terminal", { instruction: "SECRET_TERMINAL_PROMPT" });

    const view = await showUsage();
    assert.strictEqual((await callsOf("private-model")).length, 2);
    for (const secret of ["SECRET_CODE", "SECRET_PROMPT_WORDS", "SECRET_TERMINAL_PROMPT", "Secret answer"]) {
      assert.ok(!view.includes(secret), `the tab must not contain ${secret}`);
    }
  });
});
