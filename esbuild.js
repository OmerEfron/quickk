const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");

async function bundle(options) {
  const ctx = await esbuild.context(options);
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

async function main() {
  const pluginDir = path.join("node_modules", "quickk-shadow");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, "package.json"),
    JSON.stringify({ name: "quickk-shadow", version: "0.0.0", private: true, main: "index.js" }, null, 2) + "\n"
  );

  await bundle({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: "dist/extension.js",
    external: ["vscode"],
    // jsonc-parser's "main" is a UMD build whose requires esbuild can't follow; its "module" build bundles.
    mainFields: ["module", "main"],
    sourcemap: true,
    minify: !watch,
    logLevel: "info",
  });
  // The TypeScript server loads this file from node_modules. It is not part of dist/extension.js.
  await bundle({
    entryPoints: ["src/tsPlugin.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: path.join(pluginDir, "index.js"),
    sourcemap: true,
    logLevel: "info",
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
