import { promises as fs } from "fs";
import { applyEdits, JSONPath, modify, parse, ParseError } from "jsonc-parser";
import * as path from "path";
import { isDeepStrictEqual } from "util";

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

/**
 * Appends the `items` that are not in the JSON array at `path` yet, creating the array if it is missing.
 * Returns `text` unchanged when nothing is missing. Throws when `text` is not valid JSON with comments.
 */
export function addToArray(text: string, path: JSONPath, items: unknown[]): string {
  for (const item of items) {
    const errors: ParseError[] = [];
    const root = parse(text, errors, { allowTrailingComma: true, allowEmptyContent: true });
    if (errors.length > 0) {
      throw new Error("it is not valid JSON");
    }
    const current: unknown = path.reduce<any>((value, segment) => value?.[segment], root) ?? [];
    if (!Array.isArray(current)) {
      throw new Error(`"${path.join(".")}" is not a list`);
    }
    if (!current.some((existing) => isDeepStrictEqual(existing, item))) {
      text = applyEdits(text, modify(text, [...path, -1], item, { ...FORMAT, isArrayInsertion: true }));
    }
  }
  return text;
}

/**
 * Applies `edit` to the file's text (a missing file counts as empty) and writes it only if it changed.
 * Returns true if it wrote. When `edit` throws, nothing is written and the error names the file.
 */
export async function editJsonFile(file: string, edit: (text: string) => string): Promise<boolean> {
  const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  let changed: string;
  try {
    changed = edit(text);
  } catch (error) {
    throw new Error(`QuickK could not edit ${file}: ${(error as Error).message}.`);
  }
  if (changed === text) {
    return false;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, changed);
  return true;
}
