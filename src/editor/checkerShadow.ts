import * as vscode from "vscode";
import { hiddenRange, tsServerPath } from "./checkerText";
import { EditSessionManager, Session } from "./editSession";

const PLUGIN = "quickk-shadow";

const CHECKED = new Set(["javascript", "javascriptreact", "typescript", "typescriptreact"]);

interface ShadowFile {
  path: string;
  startLine: number;
  lineCount: number;
}

/**
 * Tells the TypeScript server which old lines to treat as blank.
 * One list covers every open proposal. A change is sent only when that list changes.
 */
export function registerCheckerShadow(sessions: EditSessionManager): vscode.Disposable {
  const files = new Map<string, ShadowFile>();

  const publish = () => {
    void vscode.commands
      .executeCommand("_typescript.configurePlugin", PLUGIN, { files: [...files.values()] })
      .then(undefined, () => undefined);
  };

  const subscription = sessions.onDidChange((change) => {
    const next = shadowFor(change.uri, change.session, sessions);
    const key = change.uri.toString();
    const prev = files.get(key);
    if (same(prev, next)) {
      return;
    }
    if (next) {
      files.set(key, next);
    } else {
      files.delete(key);
    }
    publish();
  });

  return vscode.Disposable.from(
    subscription,
    new vscode.Disposable(() => {
      if (files.size === 0) {
        return;
      }
      files.clear();
      publish();
    })
  );
}

function shadowFor(uri: vscode.Uri, session: Session | undefined, sessions: EditSessionManager): ShadowFile | undefined {
  if (!session) {
    return undefined;
  }
  const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === uri.toString());
  if (!document || !CHECKED.has(document.languageId)) {
    return undefined;
  }
  const green = sessions.greenLines(session);
  const hidden = hiddenRange({
    state: session.state,
    mode: session.mode,
    startLine: session.startLine,
    originalLineCount: session.originalLines.length,
    greenLineCount: green?.length ?? 0,
  });
  if (!hidden) {
    return undefined;
  }
  return { path: tsServerPath(uri), ...hidden };
}

function same(a: ShadowFile | undefined, b: ShadowFile | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.path === b.path && a.startLine === b.startLine && a.lineCount === b.lineCount;
}
