import * as vscode from "vscode";
import { apiKeyReady, promptForApiKey, storeApiKey } from "../config";
import { offerSetupOnce, runSetup, SetupStep } from "./runner";

const API_KEYS_URL = "https://platform.openai.com/api-keys";

/** Test arguments for quickk.setUp. With `answers` set, no prompt is shown and a missing answer is a decline. */
export interface SetupArgs {
  answers?: { apiKey?: string };
  /** Run like the startup offer: steps declined before are skipped. */
  auto?: boolean;
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

export async function setUp(context: vscode.ExtensionContext, args: SetupArgs = {}): Promise<string[]> {
  const steps = [apiKeyStep(context, args.answers)];
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
