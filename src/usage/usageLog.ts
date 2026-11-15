import * as vscode from "vscode";
import { renderUsageView, UsageEntry } from "./usageView";

const LOG_KEY = "quickk.usageLog";
const SCHEME = "quickk-usage";
// The last path segment becomes the tab title.
const VIEW_URI = vscode.Uri.from({ scheme: SCHEME, path: "/QuickK Usage" });

/** The entries of the usage log, kept in global state: one log for this install. */
export function readUsageLog(state: vscode.Memento): UsageEntry[] {
  return state.get<UsageEntry[]>(LOG_KEY, []);
}

export async function saveUsageEntry(state: vscode.Memento, entry: UsageEntry): Promise<void> {
  await state.update(LOG_KEY, [...readUsageLog(state), entry]);
}

/**
 * Registers QuickK: Show Usage. The usage view is a read-only document that shows a picture of the
 * log from the last time the command ran. Nothing else refreshes it.
 */
export function registerUsageView(state: vscode.Memento): vscode.Disposable {
  let text = renderUsageView([], Date.now());
  const changed = new vscode.EventEmitter<vscode.Uri>();
  const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    onDidChange: changed.event,
    provideTextDocumentContent: () => text,
  });
  const command = vscode.commands.registerCommand("quickk.showUsage", async () => {
    text = renderUsageView(readUsageLog(state), Date.now());
    changed.fire(VIEW_URI);
    const doc = await vscode.workspace.openTextDocument(VIEW_URI);
    await vscode.window.showTextDocument(doc, { preview: false });
  });
  return vscode.Disposable.from(changed, provider, command);
}
