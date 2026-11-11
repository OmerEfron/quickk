import * as assert from "assert";
import * as fs from "fs";
import { parse } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import { addQuickK } from "../../src/setup/argv";
import { addToArray, editJsonFile } from "../../src/setup/jsonEdit";
import { addQuickKBindings } from "../../src/setup/shortcut";

const KEY = ["enable-proposed-api"];

describe("JSONC edit", () => {
  it("creates the list in an empty file", () => {
    assert.deepStrictEqual(JSON.parse(addToArray("", KEY, ["quickk.quickk"])), {
      "enable-proposed-api": ["quickk.quickk"],
    });
  });

  it("keeps comments and trailing commas", () => {
    const text = `// This configuration file allows you to pass permanent command line arguments.
{
  // Crash reports
  "crash-reporter-id": "abc", // keep me
}
`;
    const result = addToArray(text, KEY, ["quickk.quickk"]);
    assert.strictEqual(
      result.indexOf(`"crash-reporter-id": "abc", // keep me`),
      text.indexOf(`"crash-reporter-id": "abc", // keep me`)
    );
    assert.ok(result.startsWith("// This configuration file") && result.includes("// Crash reports"));
    assert.deepStrictEqual(parse(result), {
      "crash-reporter-id": "abc",
      "enable-proposed-api": ["quickk.quickk"],
    });
  });

  it("adds QuickK to a list for another extension", () => {
    const text = `{\n  "enable-proposed-api": ["other.ext",], // others\n}\n`;
    const result = addToArray(text, KEY, ["quickk.quickk"]);
    assert.deepStrictEqual(parse(result)["enable-proposed-api"], ["other.ext", "quickk.quickk"]);
    assert.ok(result.includes("// others"));
  });

  it("changes nothing when QuickK is already listed", () => {
    const text = `{ "enable-proposed-api": ["quickk.quickk"] }`;
    assert.strictEqual(addToArray(text, KEY, ["quickk.quickk"]), text);
  });

  it("does not add an entry that is already there in another key order", () => {
    const text = `[{ "key": "cmd+k", "command": "quickk.editor" }]`;
    assert.strictEqual(addToArray(text, [], [{ command: "quickk.editor", key: "cmd+k" }]), text);
  });

  it("refuses invalid JSON", () => {
    assert.throws(() => addToArray(`{ "enable-proposed-api": [ }`, KEY, ["quickk.quickk"]), /not valid JSON/);
  });

  it("does not move a one-line binding and its comment, or an argv comment", () => {
    const binding = `{ "key": "cmd+s", "command": "mine" } // keep`;
    const keys = `[${binding}\n]\n`;
    const keysResult = addQuickKBindings(keys);
    assert.strictEqual(keysResult.indexOf(binding), keys.indexOf(binding));

    const comment = `"crash-reporter-id": "abc", // id`;
    const argv = `{\n  ${comment}\n}\n`;
    const argvResult = addQuickK(argv);
    assert.strictEqual(argvResult.indexOf(comment), argv.indexOf(comment));
  });
});

describe("JSONC file edit", () => {
  const add = (text: string) => addToArray(text, KEY, ["quickk.quickk"]);
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "quickk-json-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates a missing file and its folder, and a second run writes nothing", async () => {
    const file = path.join(dir, ".vscode", "argv.json");
    assert.strictEqual(await editJsonFile(file, add), true);
    assert.deepStrictEqual(parse(fs.readFileSync(file, "utf8")), { "enable-proposed-api": ["quickk.quickk"] });
    assert.strictEqual(await editJsonFile(file, add), false);
  });

  it("writes nothing and names the file when it is invalid", async () => {
    const file = path.join(dir, "argv.json");
    fs.writeFileSync(file, "{ oops");
    await assert.rejects(editJsonFile(file, add), (error: Error) => error.message.includes(file));
    assert.strictEqual(fs.readFileSync(file, "utf8"), "{ oops");
  });
});
