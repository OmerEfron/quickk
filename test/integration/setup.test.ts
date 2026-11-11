import * as assert from "assert";
import * as fs from "fs";
import { parse } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

let server: MockServer;
const argvPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "quickk-argv-")), "argv.json");

const config = () => vscode.workspace.getConfiguration("quickk");
const setUp = (args: object) => vscode.commands.executeCommand<string[]>("quickk.setUp", { argvPath, ...args });

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

  it("turns on the inline box in argv.json, keeping its comments, and a second run changes nothing", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const original = '// argv\n{\n  "crash-reporter-id": "abc", // id\n}\n';
    fs.writeFileSync(argvPath, original);
    const inline = (answers: object, auto = false) => setUp({ inlineBoxAvailable: false, auto, answers });

    assert.deepStrictEqual(await inline({}), ["inlineBox"], "first run asks");
    assert.deepStrictEqual(await inline({}, true), [], "a declined step is skipped automatically");
    assert.strictEqual(fs.readFileSync(argvPath, "utf8"), original, "a decline writes nothing");

    assert.deepStrictEqual(await inline({ inlineBox: true }), ["inlineBox"], "the command asks again");
    const text = fs.readFileSync(argvPath, "utf8");
    assert.deepStrictEqual(parse(text), { "crash-reporter-id": "abc", "enable-proposed-api": ["quickk.quickk"] });
    assert.ok(text.startsWith("// argv\n") && text.includes("// id"), "comments are kept");

    assert.deepStrictEqual(await inline({ inlineBox: true }), [], "a second run asks nothing");
    assert.strictEqual(fs.readFileSync(argvPath, "utf8"), text, "a second run changes nothing");
  });

  it("skips the inline box step when the inline box can already be used", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    fs.writeFileSync(argvPath, "{}");
    assert.deepStrictEqual(await setUp({ answers: { inlineBox: true } }), []);
    assert.strictEqual(fs.readFileSync(argvPath, "utf8"), "{}");
  });
});
