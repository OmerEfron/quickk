import * as vscode from "vscode";
import { isLocalUrl, ProviderSettings } from "./provider/openaiCompatible";

const SECRET_KEY = "quickk.apiKey";

export interface QuickKConfig {
  contextLines: number;
  maxContextChars: number;
}

export function readContextConfig(): QuickKConfig {
  const config = vscode.workspace.getConfiguration("quickk");
  return {
    contextLines: Math.max(0, config.get<number>("contextLines", 60)),
    maxContextChars: Math.max(1000, config.get<number>("maxContextChars", 24000)),
  };
}

/**
 * Reads provider settings and the API key.
 * Returns undefined when a key is needed but the user did not give one.
 */
export async function readProviderSettings(
  secrets: vscode.SecretStorage
): Promise<ProviderSettings | undefined> {
  const config = vscode.workspace.getConfiguration("quickk");
  const baseUrl = config.get<string>("baseUrl", "https://api.openai.com/v1");
  let apiKey = await secrets.get(SECRET_KEY);

  if (!apiKey && !isLocalUrl(baseUrl)) {
    const choice = await vscode.window.showWarningMessage(
      "QuickK needs an API key before it can send a request.",
      "Set API Key"
    );
    if (choice !== "Set API Key") {
      return undefined;
    }
    apiKey = await promptForApiKey(secrets);
    if (!apiKey) {
      return undefined;
    }
  }

  return {
    baseUrl,
    model: config.get<string>("model", "gpt-4o-mini"),
    maxTokens: config.get<number>("maxTokens", 2048),
    temperature: config.get<number | null>("temperature", 0.2),
    timeoutMs: config.get<number>("timeoutMs", 60000),
    apiKey: apiKey || undefined,
  };
}

export async function promptForApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: "QuickK: API Key",
    prompt: "Paste the API key for your provider. It is stored in VS Code SecretStorage.",
    password: true,
    ignoreFocusOut: true,
    validateInput: (text) => (text.trim().length === 0 ? "The key cannot be empty." : undefined),
  });
  const key = value?.trim();
  if (!key) {
    return undefined;
  }
  await storeApiKey(secrets, key);
  return key;
}

export function storeApiKey(secrets: vscode.SecretStorage, key: string): Thenable<void> {
  return secrets.store(SECRET_KEY, key);
}

/** True when no key is needed: one is stored or the base URL is local. */
export async function apiKeyReady(secrets: vscode.SecretStorage): Promise<boolean> {
  const baseUrl = vscode.workspace.getConfiguration("quickk").get<string>("baseUrl", "https://api.openai.com/v1");
  return isLocalUrl(baseUrl) || Boolean(await secrets.get(SECRET_KEY));
}

export async function clearApiKey(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
  void vscode.window.showInformationMessage("QuickK: API key removed.");
}
