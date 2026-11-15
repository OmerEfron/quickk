import * as vscode from "vscode";
import { estimateCost } from "./pricing";
import { renderUsageView, UsageEntry } from "./usageView";

const LOG_KEY = "quickk.usageLog";
const SCHEME = "quickk-usage";
// The last path segment becomes the tab title.
const VIEW_URI = vscode.Uri.from({ scheme: SCHEME, path: "/QuickK Usage" });

// After update() resolves, VS Code can still put an older stored copy back into the cache, and the
// next save would then build on that old copy. So the list lives in memory, and after each write
// we watch the cache for a short time and write the memory list again if the cache differs.
const WATCH_MS = 500;
const POLL_MS = 20;
// The longest Show Usage waits for an open copy to take the new text.
const SHOW_WAIT_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sameEntries = (a: UsageEntry[], b: UsageEntry[]) => JSON.stringify(a) === JSON.stringify(b);

/** The usage log of this install: one list in global state, held in memory for this session. */
class UsageLog {
  entries: UsageEntry[];
  /** Saves run one at a time. */
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly state: vscode.Memento) {
    this.entries = state.get<UsageEntry[]>(LOG_KEY, []);
  }

  add(entry: UsageEntry): void {
    this.entries = [...this.entries, entry];
    this.queueWrite();
  }

  /** Empties the memory list and queues the write on the same chain as add(), so the watch cannot undo it. */
  clear(): void {
    this.entries = [];
    this.queueWrite();
  }

  private queueWrite(): void {
    this.saving = this.saving.then(() => this.write()).catch(() => undefined);
  }

  private async write(): Promise<void> {
    await this.state.update(LOG_KEY, this.entries);
    let deadline = Date.now() + WATCH_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      if (!sameEntries(this.state.get<UsageEntry[]>(LOG_KEY, []), this.entries)) {
        await this.state.update(LOG_KEY, this.entries);
        deadline = Date.now() + WATCH_MS;
      }
    }
  }
}

const logs = new WeakMap<vscode.Memento, UsageLog>();

function logOf(state: vscode.Memento): UsageLog {
  let log = logs.get(state);
  if (!log) {
    log = new UsageLog(state);
    logs.set(state, log);
  }
  return log;
}

/** The entries of the usage log, from memory. */
export function readUsageLog(state: vscode.Memento): UsageEntry[] {
  return logOf(state).entries;
}

/**
 * Adds an entry to the memory list at once. Storing it happens in the background. The estimated cost
 * is worked out here, once, so every caller gets the same rule and the figure never changes later.
 */
export function saveUsageEntry(state: vscode.Memento, entry: UsageEntry): void {
  logOf(state).add({ ...entry, estimatedCost: estimateCost(entry) });
}

/** Registers QuickK: Clear Usage. It asks first and changes nothing if the user dismisses the prompt. */
export function registerClearUsage(state: vscode.Memento): vscode.Disposable {
  return vscode.commands.registerCommand("quickk.clearUsage", async () => {
    const choice = await vscode.window.showWarningMessage("Delete the whole QuickK usage log?", { modal: true }, "Delete");
    if (choice === "Delete") {
      logOf(state).clear();
    }
  });
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
    const shown = renderUsageView(readUsageLog(state), Date.now());
    text = shown;
    changed.fire(VIEW_URI);
    const doc = await vscode.workspace.openTextDocument(VIEW_URI);
    if (doc.getText() !== shown) {
      // A copy that stayed in memory after its tab closed gets its new text a moment later, in steps.
      // If the text never matches, stop waiting after a short time and show the tab anyway.
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          watch.dispose();
          resolve();
        };
        const timer = setTimeout(finish, SHOW_WAIT_MS);
        const watch = vscode.workspace.onDidChangeTextDocument((event) => {
          if (event.document === doc && doc.getText() === shown) {
            finish();
          }
        });
      });
    }
    await vscode.window.showTextDocument(doc, { preview: false });
  });
  return vscode.Disposable.from(changed, provider, command);
}
