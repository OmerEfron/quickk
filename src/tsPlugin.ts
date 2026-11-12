import type * as ts from "typescript";
import { checkerText, sameTsPath } from "./editor/checkerText";

interface ShadowFile {
  path: string;
  startLine: number;
  lineCount: number;
}

/**
 * TypeScript server plugin. While a proposal is open, the checker reads the
 * file with the old lines blank. The document itself is not changed.
 */
function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const typescript = modules.typescript;
  let files: ShadowFile[] = [];
  const projects = new Set<ts.server.Project>();

  function hiddenFor(fileName: string): ShadowFile | undefined {
    return files.find((file) => sameTsPath(file.path, fileName));
  }

  const create = (info: ts.server.PluginCreateInfo): ts.LanguageService => {
    projects.add(info.project);
    const host = info.languageServiceHost;
    const readSnapshot = host.getScriptSnapshot?.bind(host);
    const readVersion = host.getScriptVersion?.bind(host);

    host.getScriptSnapshot = (fileName) => {
      const snapshot = readSnapshot?.(fileName);
      const hidden = snapshot ? hiddenFor(fileName) : undefined;
      if (!snapshot || !hidden) {
        return snapshot;
      }
      const text = snapshot.getText(0, snapshot.getLength());
      const next = checkerText(text, hidden);
      return next === text ? snapshot : typescript.ScriptSnapshot.fromString(next);
    };

    host.getScriptVersion = (fileName) => {
      const base = readVersion?.(fileName) ?? "";
      const hidden = hiddenFor(fileName);
      return hidden ? `${base}|quickk:${hidden.startLine}:${hidden.lineCount}` : base;
    };

    return info.languageService;
  };

  const onConfigurationChanged = (config: { files?: ShadowFile[] } | undefined) => {
    files = Array.isArray(config?.files) ? config.files : [];
    for (const project of projects) {
      project.refreshDiagnostics();
    }
  };

  return { create, onConfigurationChanged };
}

export = init;
