import * as assert from "assert";
import * as ts from "typescript";
import init = require("../../src/tsPlugin");

function codes(service: ts.LanguageService, fileName: string): number[] {
  return service
    .getSemanticDiagnostics(fileName)
    .map((item) => item.code)
    .filter((code): code is number => typeof code === "number");
}

describe("TypeScript server plugin", () => {
  it("stops reporting a redeclare once the old lines are hidden, and keeps a real type error", () => {
    const fileName = "/work/example.ts";
    const text = ["const example = (a: number) => {", "    a++;", "};", 'const example: number = "no";'].join("\n");
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [fileName],
      getScriptVersion: () => "1",
      getScriptSnapshot: (name) => {
        if (name === fileName) {
          return ts.ScriptSnapshot.fromString(text);
        }
        if (!ts.sys.fileExists(name)) {
          return undefined;
        }
        const contents = ts.sys.readFile(name);
        return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
      },
      getCurrentDirectory: () => "/",
      getCompilationSettings: () => ({ strict: true, target: ts.ScriptTarget.Latest }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
    const service = ts.createLanguageService(host);
    const plugin = init({ typescript: ts });
    plugin.create({
      project: { refreshDiagnostics() {} } as ts.server.Project,
      languageService: service,
      languageServiceHost: host,
      serverHost: {} as ts.server.ServerHost,
      config: {},
    });

    assert.ok(codes(service, fileName).includes(2451));

    plugin.onConfigurationChanged?.({ files: [{ path: fileName, startLine: 0, lineCount: 3 }] });
    const after = codes(service, fileName);
    assert.ok(!after.includes(2451));
    assert.ok(after.includes(2322));
  });
});