import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { contributes } from "../../package.json";

describe("extension manifest", () => {
  it("lets only user settings choose where the API key and code are sent", () => {
    // A workspace's .vscode/settings.json must not be able to redirect requests to another host.
    const baseUrl = contributes.configuration.properties["quickk.baseUrl"] as { scope?: string };
    assert.strictEqual(baseUrl.scope, "application");
  });
});

describe("CI workflow", () => {
  it("gives the job token read-only access to the repository", () => {
    // Compiled tests run from out/test/unit, so the repo root is three levels up.
    const workflow = fs.readFileSync(path.join(__dirname, "..", "..", "..", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(workflow, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  });
});
