import * as assert from "assert";
import * as fs from "fs";
import { parse } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import { editJsonFile } from "../../src/setup/jsonEdit";
import { addQuickKBindings, keybindingsPath } from "../../src/setup/shortcut";

function bindings(platform: string): object[] {
  const key = platform === "darwin" ? "cmd+k" : "ctrl+k";
  return [
    { command: "quickk.editor", key, when: "editorTextFocus && !terminalFocus" },
    { command: "quickk.terminal", key, when: "terminalFocus" },
  ];
}

describe("Cursor shortcut", () => {
  it("finds the default profile's keybindings file from global storage", () => {
    const storage = path.join("/home", "u", "Cursor", "User", "globalStorage", "quickk.quickk");
    assert.strictEqual(keybindingsPath(storage), path.join("/home", "u", "Cursor", "User", "keybindings.json"));
  });

  it("writes cmd+k on macOS, because the user file ignores the mac field", () => {
    assert.deepStrictEqual(parse(addQuickKBindings("", "darwin")), bindings("darwin"));
  });

  it("writes ctrl+k on other platforms", () => {
    assert.deepStrictEqual(parse(addQuickKBindings("", "linux")), bindings("linux"));
  });

  it("keeps comments and the user's bindings", () => {
    const text = `// Place your key bindings in this file
[
  { "key": "cmd+s", "command": "mine" }, // keep me
]
`;
    const result = addQuickKBindings(text, "linux");
    assert.deepStrictEqual(parse(result), [{ key: "cmd+s", command: "mine" }, ...bindings("linux")]);
    assert.ok(result.startsWith("// Place your key bindings in this file\n") && result.includes("// keep me"));
    assert.strictEqual(result.indexOf(`{ "key": "cmd+s", "command": "mine" }, // keep me`), text.indexOf(`{ "key": "cmd+s", "command": "mine" }, // keep me`));
  });

  it("does not duplicate bindings that are already copied", () => {
    const text = addQuickKBindings("[]", "darwin");
    assert.strictEqual(addQuickKBindings(text, "darwin"), text);
  });

  it("still adds the macOS key when the file only has the ignored mac field", () => {
    const text = `[{ "command": "quickk.editor", "key": "ctrl+k", "mac": "cmd+k", "when": "editorTextFocus && !terminalFocus" }]`;
    const parsed = parse(addQuickKBindings(text, "darwin"));
    assert.deepStrictEqual(
      parsed.filter((binding: { key: string }) => binding.key === "cmd+k").map((binding: { command: string }) => binding.command),
      ["quickk.editor", "quickk.terminal"]
    );
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
      assert.deepStrictEqual(parse(fs.readFileSync(file, "utf8")), bindings(process.platform));
    });

    it("refuses invalid JSON and writes nothing", async () => {
      const file = path.join(dir, "keybindings.json");
      fs.writeFileSync(file, "[ { oops");
      await assert.rejects(editJsonFile(file, addQuickKBindings), /not valid JSON/);
      assert.strictEqual(fs.readFileSync(file, "utf8"), "[ { oops");
    });
  });
});
