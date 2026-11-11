import * as assert from "assert";
import * as fs from "fs";
import { parse } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import { editJsonFile } from "../../src/setup/jsonEdit";
import { addQuickKBindings, keybindingsPath } from "../../src/setup/shortcut";

const MAC_BINDINGS = [
  { key: "cmd+k", command: "quickk.editor", when: "editorTextFocus && !terminalFocus" },
  { key: "cmd+k", command: "quickk.terminal", when: "terminalFocus" },
];
const addMac = (text: string) => addQuickKBindings(text, "darwin");

describe("Cursor shortcut", () => {
  it("finds the default profile's keybindings file from global storage", () => {
    const storage = path.join("/home", "u", "Cursor", "User", "globalStorage", "quickk.quickk");
    assert.strictEqual(keybindingsPath(storage), path.join("/home", "u", "Cursor", "User", "keybindings.json"));
  });

  it("writes both Cmd+K bindings into an empty file", () => {
    assert.deepStrictEqual(parse(addMac("")), MAC_BINDINGS);
  });

  it("uses Ctrl+K outside macOS", () => {
    assert.deepStrictEqual(
      parse(addQuickKBindings("", "linux")).map((binding: { key: string }) => binding.key),
      ["ctrl+k", "ctrl+k"]
    );
  });

  it("keeps comments and the user's bindings", () => {
    const text = `// Place your key bindings in this file
[
  { "key": "cmd+s", "command": "mine" }, // keep me
]
`;
    const result = addMac(text);
    assert.deepStrictEqual(parse(result), [{ key: "cmd+s", command: "mine" }, ...MAC_BINDINGS]);
    assert.ok(result.startsWith("// Place your key bindings in this file\n") && result.includes("// keep me"));
  });

  it("changes nothing when QuickK's bindings are already there", () => {
    const text = addMac("[]");
    assert.strictEqual(addMac(text), text);
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
      assert.strictEqual(await editJsonFile(file, addMac), true);
      assert.deepStrictEqual(parse(fs.readFileSync(file, "utf8")), MAC_BINDINGS);
    });

    it("refuses invalid JSON and writes nothing", async () => {
      const file = path.join(dir, "keybindings.json");
      fs.writeFileSync(file, "[ { oops");
      await assert.rejects(editJsonFile(file, addMac), /not valid JSON/);
      assert.strictEqual(fs.readFileSync(file, "utf8"), "[ { oops");
    });
  });
});
