import * as vscode from "vscode";
import { apiKeyReady, promptForApiKey, storeApiKey } from "../config";
import { addQuickK, argvListsQuickK, argvPath } from "./argv";
import { editJsonFile } from "./jsonEdit";
import { offerSetupOnce, runSetup, SetupStep } from "./runner";
import { addQuickKBindings, hasQuickKBindings, isCursor, keybindingsPath } from "./shortcut";

const API_KEYS_URL = "https://platform.openai.com/api-keys";

/** Test arguments for quickk.setUp. With `answers` set, no prompt is shown and a missing answer is a decline. */
export interface SetupArgs {
  answers?: { shortcut?: boolean; apiKey?: string; inlineBox?: boolean };
  /** Run like the startup offer: steps declined before are skipped. */
  auto?: boolean;
  /** Used instead of the real argv.json. */
  argvPath?: string;
  /** Used instead of the real keybindings.json. */
  keybindingsPath?: string;
  /** Overrides the check whether the editor is Cursor. */
  isCursor?: boolean;
  /** Overrides the check whether the inline box can already be used. */
  inlineBoxAvailable?: boolean;
}

function shortcutStep(context: vscode.ExtensionContext, args: SetupArgs): SetupStep {
  const file = args.keybindingsPath ?? keybindingsPath(context.globalStorageUri.fsPath);
  return {
    id: "shortcut",
    isDone: async () => !(args.isCursor ?? isCursor(vscode.env.appName)) || (await hasQuickKBindings(file)),
    ask: async () => {
      if (args.answers) {
        if (!args.answers.shortcut) {
          return false;
        }
      } else {
        const choice = await vscode.window.showInformationMessage(
          `Use Cmd+K for QuickK? QuickK adds its Cmd+K bindings to ${file}.`,
          "Yes",
          "No"
        );
        if (choice === "No") {
          return false;
        }
        if (choice !== "Yes") {
          return undefined;
        }
      }
      try {
        await editJsonFile(file, addQuickKBindings);
      } catch (error) {
        void vscode.window.showErrorMessage(`${(error as Error).message} Add QuickK's Cmd+K bindings by hand.`);
        return undefined;
      }
      return true;
    },
  };
}

function apiKeyStep(context: vscode.ExtensionContext, answers: SetupArgs["answers"]): SetupStep {
  return {
    id: "apiKey",
    isDone: () => apiKeyReady(context.secrets),
    ask: async () => {
      if (answers) {
        if (answers.apiKey) {
          await storeApiKey(context.secrets, answers.apiKey);
        }
        return Boolean(answers.apiKey);
      }
      const choice = await vscode.window.showInformationMessage(
        "QuickK needs an API key from your AI provider.",
        "Enter API Key",
        "Get an API key"
      );
      if (choice === undefined) {
        return undefined;
      }
      if (choice === "Get an API key") {
        await vscode.env.openExternal(vscode.Uri.parse(API_KEYS_URL));
      }
      return (await promptForApiKey(context.secrets)) !== undefined ? true : undefined;
    },
  };
}

function insetApiEnabled(): boolean {
  if (typeof vscode.window.createWebviewTextEditorInset !== "function") {
    return false;
  }
  try {
    // The proposal check runs first. When it passes, an undefined editor fails with "not a visible editor".
    vscode.window.createWebviewTextEditorInset(undefined as unknown as vscode.TextEditor, 0, 0);
  } catch (error) {
    return String(error).includes("not a visible editor");
  }
  return true;
}

function inlineBoxStep(args: SetupArgs): SetupStep {
  const file = args.argvPath ?? argvPath(vscode.env.appName);
  return {
    id: "inlineBox",
    isDone: async () => (args.inlineBoxAvailable ?? insetApiEnabled()) || (await argvListsQuickK(file)),
    ask: async () => {
      if (args.answers) {
        if (!args.answers.inlineBox) {
          return false;
        }
      } else {
        const choice = await vscode.window.showInformationMessage(
          `Turn on the inline box? QuickK adds itself to "enable-proposed-api" in ${file}.`,
          "Yes",
          "No"
        );
        if (choice === "No") {
          return false;
        }
        if (choice !== "Yes") {
          return undefined;
        }
      }
      try {
        await editJsonFile(file, addQuickK);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `${(error as Error).message} Add "quickk.quickk" to "enable-proposed-api" by hand.`
        );
        return undefined;
      }
      if (!args.answers) {
        const choice = await vscode.window.showInformationMessage(
          "The inline box works after a restart. If it does not show up, quit the editor fully and open it again.",
          "Restart now"
        );
        if (choice === "Restart now") {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      }
      return true;
    },
  };
}

export async function setUp(context: vscode.ExtensionContext, args: SetupArgs = {}): Promise<string[]> {
  const steps = [shortcutStep(context, args), apiKeyStep(context, args.answers), inlineBoxStep(args)];
  const asked = await runSetup(steps, context.globalState, Boolean(args.auto));
  void vscode.window.showInformationMessage("Select some code and press Cmd+K.");
  return asked;
}

export function registerSetup(context: vscode.ExtensionContext): vscode.Disposable {
  void offerSetupOnce(context.globalState, async () => {
    if ((await vscode.window.showInformationMessage("Set up QuickK", "Set up")) === "Set up") {
      await setUp(context, { auto: true });
    }
  });
  return vscode.commands.registerCommand("quickk.setUp", (args?: SetupArgs) => setUp(context, args));
}
