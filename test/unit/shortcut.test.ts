import * as assert from "assert";
import * as fs from "fs";
import { parse } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import { editJsonFile } from "../../src/setup/jsonEdit";
import { addQuickKBindings, keybindingsPath } from "../../src/setup/shortcut";

const BINDINGS = [
  { command: "quickk.editor", key: "ctrl+k", mac: "cmd+k", when: "editorTextFocus && !terminalFocus" },
  { command: "quickk.terminal", key: "ctrl+k", mac: "cmd+k", when: "terminalFocus" },
];

describe("Cursor shortcut", () => {
  it("finds the default profile's keybindings file from global storage", () => {
    const storage = path.join("/home", "u", "Cursor", "User", "globalStorage", "quickk.quickk");
    assert.strictEqual(keybindingsPath(storage), path.join("/home", "u", "Cursor", "User", "keybindings.json"));
  });

  it("copies both Cmd+K bindings, including key and mac", () => {
    assert.deepStrictEqual(parse(addQuickKBindings("")), BINDINGS);
  });

  it("keeps comments and the user's bindings", () => {
    const text = `// Place your key bindings in this file
[
  { "key": "cmd+s", "command": "mine" }, // keep me
]
`;
    const result = addQuickKBindings(text);
    assert.deepStrictEqual(parse(result), [{ key: "cmd+s", command: "mine" }, ...BINDINGS]);
    assert.ok(result.startsWith("// Place your key bindings in this file\n") && result.includes("// keep me"));
    assert.strictEqual(result.indexOf(`{ "key": "cmd+s", "command": "mine" }, // keep me`), text.indexOf(`{ "key": "cmd+s", "command": "mine" }, // keep me`));
  });

  it("does not duplicate bindings that are already copied", () => {
    const text = `[
  { "when": "editorTextFocus && !terminalFocus", "mac": "cmd+k", "key": "ctrl+k", "command": "quickk.editor" },
  { "command": "quickk.terminal", "key": "ctrl+k", "mac": "cmd+k", "when": "terminalFocus" }
]`;
    assert.strictEqual(addQuickKBindings(text), text);
  });

  it("changes nothing when QuickK's bindings are already there", () => {
    const text = addQuickKBindings("[]");
    assert.strictEqual(addQuickKBindings(text), text);
  });

  describe("file", () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "quickk-keys-"));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("creates a missing file", async () => {
      const file = path.join(dir, "keybindings.json");
      assert.strictEqual(await editJsonFile(file, addQuickKBindings), true);
      assert.deepStrictEqual(parse(fs.readFileSync(file, "utf8")), BINDINGS);
    });

    it("refuses invalid JSON and writes nothing", async () => {
      const file = path.join(dir, "keybindings.json");
      fs.writeFileSync(file, "[ { oops");
      await assert.rejects(editJsonFile(file, addQuickKBindings), /not valid JSON/);
      assert.strictEqual(fs.readFileSync(file, "utf8"), "[ { oops");
    });
  });
});
