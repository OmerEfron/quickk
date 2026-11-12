import * as assert from "assert";
import * as ts from "typescript";
import { checkerText, hiddenRange, HiddenLines, sameTsPath, tsServerPath } from "../../src/editor/checkerText";

/** Diagnostics TypeScript reports for the text the checker is given. */
function diagnostics(text: string, hidden: HiddenLines): { code: number; line: number }[] {
  const sourceText = checkerText(text, hidden);
  const fileName = "example.ts";
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
    name === fileName ? source : getSourceFile(name, languageVersion, onError, shouldCreate);
  const program = ts.createProgram([fileName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((item) => item.file === source && item.start !== undefined)
    .map((item) => ({ code: item.code, line: source.getLineAndCharacterOfPosition(item.start!).line }));
}

const OLD = ["const example = (a: number) => {", "    for (let i = 0; i < 10; i++) {", "        if (i % 2 === 0) {", "            a++", "        }", "    }", "}"];
const NEU = "const example = (a: number) => Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? a++ : a));";

describe("checker text while a proposal is open", () => {
  it("does not report a redeclare error for a name that is in both copies", () => {
    const text = [...OLD, NEU, "", "example(1);"].join("\n");
    const found = diagnostics(text, { startLine: 0, lineCount: OLD.length });
    assert.deepStrictEqual(
      found.filter((item) => item.code === 2451),
      []
    );
  });

  it("still reports a type error in the new code, on that line", () => {
    const text = [...OLD, 'const example: number = "no";'].join("\n");
    const found = diagnostics(text, { startLine: 0, lineCount: OLD.length });
    const typeError = found.find((item) => item.code === 2322);
    assert.ok(typeError);
    assert.strictEqual(typeError.line, OLD.length);
  });

  it("still reports a redeclare that is really in the new code", () => {
    const text = ["const other = 1;", "const example = 1;", "const example = 2;"].join("\n");
    const found = diagnostics(text, { startLine: 0, lineCount: 1 });
    assert.ok(found.some((item) => item.code === 2451 && item.line > 0));
  });
});

describe("which lines the checker hides", () => {
  const both = { state: "review" as const, mode: "edit" as const, startLine: 4, originalLineCount: 7, greenLineCount: 1 };

  it("hides the old lines while both copies are on screen", () => {
    assert.deepStrictEqual(hiddenRange(both), { startLine: 4, lineCount: 7 });
    assert.deepStrictEqual(hiddenRange({ ...both, state: "generating" }), { startLine: 4, lineCount: 7 });
  });

  it("hides nothing before the new code is written, after a decision, or when lines are only added", () => {
    assert.strictEqual(hiddenRange({ ...both, greenLineCount: 0 }), undefined);
    assert.strictEqual(hiddenRange({ ...both, state: "closed" }), undefined);
    assert.strictEqual(hiddenRange({ ...both, state: "detached" }), undefined);
    assert.strictEqual(hiddenRange({ ...both, mode: "insert", originalLineCount: 0 }), undefined);
    assert.strictEqual(hiddenRange({ ...both, mode: "blank" }), undefined);
  });
});

describe("TypeScript server paths", () => {
  it("uses the file path for a saved file and the in-memory path for an untitled file", () => {
    assert.strictEqual(
      tsServerPath({ scheme: "file", authority: "", path: "/Users/me/example.ts", fsPath: "/Users/me/example.ts" }),
      "/Users/me/example.ts"
    );
    assert.strictEqual(
      tsServerPath({ scheme: "untitled", authority: "", path: "/Untitled-1", fsPath: "/Untitled-1" }),
      "^/untitled/ts-nul-authority/Untitled-1"
    );
  });

  it("treats slash differences as the same path", () => {
    assert.strictEqual(sameTsPath("C:\\work\\example.ts", "C:/work/example.ts"), true);
    assert.strictEqual(sameTsPath("/work/a.ts", "/work/b.ts"), false);
  });
});
