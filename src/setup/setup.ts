import * as vscode from "vscode";
import { apiKeyReady, promptForApiKey, storeApiKey } from "../config";
import { addQuickK, argvListsQuickK, argvPath } from "./argv";
import { editJsonFile } from "./jsonEdit";
import { offerSetupOnce, runSetup, SetupStep } from "./runner";

const API_KEYS_URL = "https://platform.openai.com/api-keys";

/** Test arguments for quickk.setUp. With `answers` set, no prompt is shown and a missing answer is a decline. */
export interface SetupArgs {
  answers?: { apiKey?: string; inlineBox?: boolean };
  /** Run like the startup offer: steps declined before are skipped. */
  auto?: boolean;
  /** Used instead of the real argv.json. */
  argvPath?: string;
  /** Overrides the check whether the inline box can already be used. */
  inlineBoxAvailable?: boolean;
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
      if (choice === "Get an API key") {
        await vscode.env.openExternal(vscode.Uri.parse(API_KEYS_URL));
      }
      return choice !== undefined && (await promptForApiKey(context.secrets)) !== undefined;
    },
  };
}

/** True if the proposed API "editorInsets" is enabled for QuickK. */
function insetApiEnabled(): boolean {
  if (typeof vscode.window.createWebviewTextEditorInset !== "function") {
    return false;
  }
  try {
    // The proposal check runs first. When it passes, an undefined editor fails with "not a visible editor".
    vscode.window.createWebviewTextEditorInset(undefined as unknown as vscode.TextEditor, 0, 0);
  } catch (error) {
    return !String(error).includes("CANNOT use API proposal");
  }
  return true;
}

function inlineBoxStep(args: SetupArgs): SetupStep {
  const file = args.argvPath ?? argvPath(vscode.env.appName);
  return {
    id: "inlineBox",
    isDone: async () => (args.inlineBoxAvailable ?? insetApiEnabled()) || (await argvListsQuickK(file)),
    ask: async () => {
      const yes = args.answers
        ? Boolean(args.answers.inlineBox)
        : (await vscode.window.showInformationMessage(
            `Turn on the inline box? QuickK adds itself to "enable-proposed-api" in ${file}.`,
            "Yes",
            "No"
          )) === "Yes";
      if (!yes) {
        return false;
      }
      try {
        await editJsonFile(file, addQuickK);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `${(error as Error).message} Add "quickk.quickk" to "enable-proposed-api" by hand.`
        );
        return false;
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
  const steps = [apiKeyStep(context, args.answers), inlineBoxStep(args)];
  const asked = await runSetup(steps, context.globalState, Boolean(args.auto));
  const key = process.platform === "darwin" ? "Cmd+K" : "Ctrl+K";
  void vscode.window.showInformationMessage(`QuickK is ready. Select some code and press ${key}.`);
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
