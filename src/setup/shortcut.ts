import { promises as fs } from "fs";
import * as path from "path";
import { contributes } from "../../package.json";
import { addToArray } from "./jsonEdit";

export function isCursor(appName: string): boolean {
  return /cursor/i.test(appName);
}

/** Global storage is `<User>/globalStorage/<extension id>`; the default profile's keybindings are in `<User>`. */
export function keybindingsPath(globalStorage: string): string {
  return path.join(globalStorage, "..", "..", "keybindings.json");
}

/** keybindings.json has no `mac` field, so the key for this platform is written. */
function quickKBindings(platform: NodeJS.Platform): object[] {
  return contributes.keybindings
    .filter((binding) => binding.command === "quickk.editor" || binding.command === "quickk.terminal")
    .map(({ command, key, mac, when }) => ({ key: platform === "darwin" ? mac ?? key : key, command, when }));
}

export function addQuickKBindings(text: string, platform: NodeJS.Platform = process.platform): string {
  return addToArray(text, [], quickKBindings(platform));
}

/** False when the file is missing or can not be parsed. */
export async function hasQuickKBindings(file: string): Promise<boolean> {
  try {
    const text = await fs.readFile(file, "utf8");
    return addQuickKBindings(text) === text;
  } catch {
    return false;
  }
}
