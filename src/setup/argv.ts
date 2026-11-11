import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { addToArray } from "./jsonEdit";

const PROPOSED_API = ["enable-proposed-api"];
const EXTENSION_ID = "quickk.quickk";

/** No API exposes where argv.json lives, so it is derived from `vscode.env.appName`. */
export function argvPath(appName: string, home = os.homedir()): string {
  const folder = /cursor/i.test(appName) ? ".cursor" : /insiders/i.test(appName) ? ".vscode-insiders" : ".vscode";
  return path.join(home, folder, "argv.json");
}

export function addQuickK(text: string): string {
  return addToArray(text, PROPOSED_API, [EXTENSION_ID]);
}

/** False when the file is missing or can not be parsed. */
export async function argvListsQuickK(file: string): Promise<boolean> {
  try {
    const text = await fs.readFile(file, "utf8");
    return addQuickK(text) === text;
  } catch {
    return false;
  }
}
