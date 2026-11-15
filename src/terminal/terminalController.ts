import * as vscode from "vscode";
import { readProviderSettings } from "../config";
import { readTerminalContext } from "../context/terminalContext";
import { buildTerminalMessages } from "../prompts";
import { complete, NO_USAGE, ProviderError, TokenUsage } from "../provider/openaiCompatible";
import { focusActivePrompt, runPrompt } from "../ui/prompt";
import { saveUsageEntry } from "../usage/usageLog";
import { CommandFormatError, normalizeCommand } from "../util/command";
import { findDestructiveReason } from "../util/destructive";

export interface TerminalCommandArgs {
  /** Run at once without showing the input box. */
  instruction?: string;
  /** Fill the input box with this text. */
  prefill?: string;
}

export async function runTerminalCommand(
  extension: vscode.ExtensionContext,
  args?: TerminalCommandArgs
): Promise<void> {
  if (focusActivePrompt()) {
    return;
  }
  // We always use the terminal that was active when the user pressed the key.
  // We never create a new terminal.
  const terminal = vscode.window.activeTerminal;
  if (!terminal) {
    void vscode.window.showInformationMessage("QuickK: there is no open terminal.");
    return;
  }

  await runPrompt({
    title: "QuickK: Terminal command",
    placeholder: "Describe the command you want, for example: show what uses port 3000",
    prefill: args?.prefill,
    instruction: args?.instruction,
    run: (instruction, signal, progress) => generateCommand(extension, terminal, instruction, signal, progress),
    onRetry: (instruction) =>
      void vscode.commands.executeCommand("quickk.terminal", { prefill: instruction } satisfies TerminalCommandArgs),
  });
}

async function generateCommand(
  extension: vscode.ExtensionContext,
  terminal: vscode.Terminal,
  instruction: string,
  signal: AbortSignal,
  progress: (text: string) => void
): Promise<void> {
  const settings = await readProviderSettings(extension.secrets);
  if (!settings || signal.aborted) {
    return;
  }

  // complete() drops partial text when it throws, so we note here that some text came back.
  let textArrived = false;
  let usage: TokenUsage = NO_USAGE;
  try {
    const messages = buildTerminalMessages(instruction, readTerminalContext(terminal));
    progress("QuickK: waiting for the model...");
    const result = await complete(settings, messages, {
      signal,
      onDelta: (_delta, total) => {
        textArrived = true;
        progress(`QuickK: generating... (${total} characters)`);
      },
    });
    usage = result.usage;
    if (signal.aborted) {
      return;
    }
    if (result.finishReason === "length") {
      throw new ProviderError(
        "The answer was cut off because it reached the token limit (quickk.maxTokens).",
        "truncated"
      );
    }

    let command: string;
    try {
      command = normalizeCommand(result.text);
    } catch (error) {
      if (error instanceof CommandFormatError) {
        throw new ProviderError(error.message, "format");
      }
      throw error;
    }

    const danger = findDestructiveReason(command);
    if (danger && !(await confirmDangerous(command, danger))) {
      return;
    }

    insertCommand(terminal, command);
  } finally {
    // One usage entry when the call ends, and only if text came back. This also holds when the user
    // then declines a dangerous command.
    if (textArrived) {
      saveUsageEntry(extension.globalState, {
        time: Date.now(),
        model: settings.model,
        apiAddress: settings.baseUrl,
        taskKind: "terminal",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        estimatedCost: null,
      });
    }
  }
}
/**
 * Prompts the user for confirmation if the command may be destructive.
 * 
 * @param command - The command that may be destructive.
 * @param reason - The reason why the command is considered dangerous.
 * @returns A promise that resolves to true if the user chooses to insert the command, otherwise false.
 */
async function confirmDangerous(command: string, reason: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    "QuickK: this command may be destructive.",
    { modal: true, detail: `${command}\n\nWhy: it ${reason}.\n\nIt will only be typed into the terminal. You still have to press Enter.` },
    "Insert"
  );
  return choice === "Insert";
}

/** Types the command into the terminal. It is never executed. */
function insertCommand(terminal: vscode.Terminal, command: string): void {
  if (terminal.exitStatus !== undefined) {
    offerCopy(command, "The terminal was closed.");
    return;
  }
  try {
    // The second argument is false: no line break is sent, so nothing runs.
    terminal.sendText(command, false);
    terminal.show(false);
    vscode.window.setStatusBarMessage("QuickK: command inserted. Press Enter to run it.", 5000);
  } catch {
    offerCopy(command, "Could not write to the terminal.");
  }
}

function offerCopy(command: string, reason: string): void {
  void vscode.window.showInformationMessage(`QuickK: ${reason} Generated command: ${command}`, "Copy").then((choice) => {
    if (choice === "Copy") {
      void vscode.env.clipboard.writeText(command);
    }
  });
}
