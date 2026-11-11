import * as assert from "assert";
import * as fs from "fs";
import { parse } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MockServer, startMockServer } from "../support/mockServer";

let server: MockServer;
const argvPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "quickk-argv-")), "argv.json");
const keybindingsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "quickk-keys-")), "keybindings.json");

const config = () => vscode.workspace.getConfiguration("quickk");
const setUp = (args: object) =>
  vscode.commands.executeCommand<string[]>("quickk.setUp", { argvPath, keybindingsPath, ...args });

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

  it("does not ask the shortcut step outside Cursor", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const asked = await setUp({ inlineBoxAvailable: true, answers: { shortcut: true } });
    assert.deepStrictEqual(asked, []);
    assert.ok(!fs.existsSync(keybindingsPath), "nothing is written");
  });

  it("in Cursor, the shortcut step adds the Cmd+K bindings, keeping the user's, and a second run changes nothing", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const original = '// mine\n[{ "key": "cmd+s", "command": "mine" }]\n';
    fs.writeFileSync(keybindingsPath, original);
    const cursor = (answers: object, auto = false) =>
      setUp({ isCursor: true, inlineBoxAvailable: true, auto, answers });

    assert.deepStrictEqual(await cursor({}), ["shortcut"], "first run asks");
    assert.deepStrictEqual(await cursor({}, true), [], "a declined step is skipped automatically");
    assert.strictEqual(fs.readFileSync(keybindingsPath, "utf8"), original, "a decline writes nothing");

    assert.deepStrictEqual(await cursor({ shortcut: true }), ["shortcut"], "the command asks again");
    const text = fs.readFileSync(keybindingsPath, "utf8");
    assert.deepStrictEqual(parse(text), [
      { key: "cmd+s", command: "mine" },
      { command: "quickk.editor", key: "ctrl+k", mac: "cmd+k", when: "editorTextFocus && !terminalFocus" },
      { command: "quickk.terminal", key: "ctrl+k", mac: "cmd+k", when: "terminalFocus" },
    ]);
    assert.ok(text.startsWith("// mine\n"), "comments are kept");
    assert.strictEqual(text.indexOf(`{ "key": "cmd+s", "command": "mine" }`), original.indexOf(`{ "key": "cmd+s", "command": "mine" }`));

    assert.deepStrictEqual(await cursor({ shortcut: true }), [], "a second run asks nothing");
    assert.strictEqual(fs.readFileSync(keybindingsPath, "utf8"), text, "a second run changes nothing");
  });

  it("skips the inline box step when the inline box can already be used", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    fs.writeFileSync(argvPath, "{}");
    assert.deepStrictEqual(await setUp({ answers: { inlineBox: true } }), []);
    assert.strictEqual(fs.readFileSync(argvPath, "utf8"), "{}");
  });

  it("ends with the hint to select code and press Cmd+K", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const seen: string[] = [];
    const original = vscode.window.showInformationMessage;
    vscode.window.showInformationMessage = ((message: string, ...items: string[]) => {
      seen.push(message);
      return original(message, ...items);
    }) as typeof vscode.window.showInformationMessage;
    try {
      await setUp({ inlineBoxAvailable: true, answers: {} });
    } finally {
      vscode.window.showInformationMessage = original;
    }
    assert.deepStrictEqual(seen, ["Select some code and press Cmd+K."]);
  });

  it("does not record a failed edit as a decline", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const brokenArgv = "{ nope";
    fs.writeFileSync(argvPath, brokenArgv);
    const inline = (auto = false) => setUp({ inlineBoxAvailable: false, auto, answers: { inlineBox: true } });
    assert.deepStrictEqual(await inline(), ["inlineBox"]);
    assert.strictEqual(fs.readFileSync(argvPath, "utf8"), brokenArgv);
    assert.deepStrictEqual(await inline(true), ["inlineBox"]);

    const brokenKeys = "[ { oops";
    fs.writeFileSync(keybindingsPath, brokenKeys);
    const shortcut = (auto = false) =>
      setUp({ isCursor: true, inlineBoxAvailable: true, auto, answers: { shortcut: true } });
    assert.deepStrictEqual(await shortcut(), ["shortcut"]);
    assert.strictEqual(fs.readFileSync(keybindingsPath, "utf8"), brokenKeys);
    assert.deepStrictEqual(await shortcut(true), ["shortcut"]);
  });

  it("asks again after a dismissed prompt, and skips an explicit No", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    fs.writeFileSync(keybindingsPath, `[{ "key": "cmd+s", "command": "mine" }]\n`);
    const original = vscode.window.showInformationMessage;
    const stub = (choice: string | undefined) => {
      vscode.window.showInformationMessage = (() => Promise.resolve(choice)) as typeof vscode.window.showInformationMessage;
    };
    const cursor = (auto = false) => setUp({ isCursor: true, inlineBoxAvailable: true, auto });
    try {
      stub(undefined);
      assert.deepStrictEqual(await cursor(), ["shortcut"], "a dismiss is asked");
      assert.deepStrictEqual(await cursor(true), ["shortcut"], "a dismiss is asked again");
      stub("No");
      assert.deepStrictEqual(await cursor(), ["shortcut"], "an explicit No is asked");
      assert.deepStrictEqual(await cursor(true), [], "an explicit No is skipped automatically");
    } finally {
      vscode.window.showInformationMessage = original;
    }
    await setUp({ isCursor: true, inlineBoxAvailable: true, answers: { shortcut: true } });
  });

  it("treats the inline box as usable only when the proposed API is enabled", async () => {
    await config().update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    const original = vscode.window.createWebviewTextEditorInset;
    const probe = (message: string) => {
      vscode.window.createWebviewTextEditorInset = (() => {
        throw new Error(message);
      }) as typeof vscode.window.createWebviewTextEditorInset;
    };
    try {
      fs.writeFileSync(argvPath, "{}\n");
      probe("CANNOT use API proposal: editorInsets");
      assert.deepStrictEqual(await setUp({ answers: { inlineBox: true } }), ["inlineBox"]);

      fs.writeFileSync(argvPath, "{}\n");
      probe("something unexpected");
      assert.deepStrictEqual(await setUp({ answers: { inlineBox: true } }), ["inlineBox"]);

      fs.writeFileSync(argvPath, "{}\n");
      probe("not a visible editor");
      assert.deepStrictEqual(await setUp({ answers: { inlineBox: true } }), []);
      assert.strictEqual(fs.readFileSync(argvPath, "utf8"), "{}\n");

      const listed = `{ "enable-proposed-api": ["quickk.quickk"] }\n`;
      fs.writeFileSync(argvPath, listed);
      probe("something unexpected");
      assert.deepStrictEqual(await setUp({ answers: { inlineBox: true } }), []);
      assert.strictEqual(fs.readFileSync(argvPath, "utf8"), listed);
    } finally {
      vscode.window.createWebviewTextEditorInset = original;
    }
  });
});
