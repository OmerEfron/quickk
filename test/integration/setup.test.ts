import * as assert from "assert";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

let server: MockServer;

const config = () => vscode.workspace.getConfiguration("quickk");
const setUp = (args: object) => vscode.commands.executeCommand<string[]>("quickk.setUp", args);

describe("Setup", function () {
  before(async () => {
    const extension = vscode.extensions.getExtension("quickk.quickk");
    assert.ok(extension, "extension not found");
    await extension.activate();
    server = await startMockServer(() => ({ content: "```js\nconst b = 2;\n```" }));
  });

  afterEach(async () => {
    await vscode.commands.executeCommand("quickk.clearApiKey");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  after(async () => {
    await server.close();
  });

  it("stores the key, remembers a declined step and asks nothing on a second run", async () => {
    await config().update("baseUrl", "https://api.openai.com/v1", vscode.ConfigurationTarget.Global);

    assert.deepStrictEqual(await setUp({ answers: {} }), ["apiKey"], "first run asks for the key");
    assert.deepStrictEqual(await setUp({ auto: true, answers: {} }), [], "a declined step is skipped automatically");
    assert.deepStrictEqual(await setUp({ answers: { apiKey: "sk-setup-test" } }), ["apiKey"], "the command asks again");
    assert.deepStrictEqual(await setUp({ answers: {} }), [], "a second run changes nothing");

    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const doc = await vscode.workspace.openTextDocument({ content: "const a = 1;\n", language: "javascript" });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 12);
    await vscode.commands.executeCommand("quickk.editor", { instruction: "rename" });
    await vscode.commands.executeCommand("quickk.reject");
    assert.strictEqual(server.headers.at(-1)?.authorization, "Bearer sk-setup-test");
  });

  it("skips the key step when the base URL is local", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    assert.deepStrictEqual(await setUp({ answers: {} }), []);
  });
});
