import { promises as fs } from "fs";
import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  getNodeValue,
  JSONPath,
  Node,
  parseTree,
  ParseError,
  SyntaxKind,
} from "jsonc-parser";
import * as path from "path";
import { isDeepStrictEqual } from "util";

const PARSE = { allowTrailingComma: true, allowEmptyContent: true };

/**
 * Appends the `items` that are not in the JSON array at `path` yet, creating the array if it is missing.
 * Returns `text` unchanged when nothing is missing. Throws when `text` is not valid JSON with comments.
 * `modify` rewrites the line it inserts on, so new text is applied at the closing token instead.
 */
export function addToArray(text: string, jsonPath: JSONPath, items: unknown[]): string {
  for (const item of items) {
    text = insertMissing(text, jsonPath, item);
  }
  return text;
}

function insertMissing(text: string, jsonPath: JSONPath, item: unknown): string {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, PARSE);
  if (errors.length > 0) {
    throw new Error("it is not valid JSON");
  }
  const array = root && (jsonPath.length === 0 ? root : findNodeAtLocation(root, jsonPath));
  if (array?.type === "array") {
    // getNodeValue returns a null-prototype object, which isDeepStrictEqual treats as different.
    const values = (array.children ?? []).map((child) => JSON.parse(JSON.stringify(getNodeValue(child))));
    if (values.some((existing) => isDeepStrictEqual(existing, item))) {
      return text;
    }
    return insertAtClose(text, array, JSON.stringify(item), (array.children?.length ?? 0) > 0);
  }
  if (array) {
    throw new Error(`"${jsonPath.join(".")}" is not a list`);
  }
  const key = jsonPath[jsonPath.length - 1];
  const parentPath = jsonPath.slice(0, -1);
  const parent = root && (parentPath.length === 0 ? root : findNodeAtLocation(root, parentPath));
  if (typeof key === "string" && parent?.type === "object") {
    const piece = `${JSON.stringify(key)}: [${JSON.stringify(item)}]`;
    return insertAtClose(text, parent, piece, (parent.children?.length ?? 0) > 0);
  }
  if (!root) {
    const created =
      jsonPath.length === 0
        ? JSON.stringify([item])
        : `{${JSON.stringify(String(key))}:[${JSON.stringify(item)}]}`;
    return text.length === 0 ? created : text.endsWith("\n") ? text + created : `${text}\n${created}`;
  }
  throw new Error(`"${jsonPath.join(".")}" is not a list`);
}

/** Inserts before the node's closing token. Bytes before that token, including comments, stay where they are. */
function insertAtClose(text: string, node: Node, piece: string, mayNeedComma: boolean): string {
  const closeAt = node.offset + node.length - 1;
  const gapStart = node.children?.length
    ? node.children[node.children.length - 1].offset + node.children[node.children.length - 1].length
    : node.offset + 1;
  const comma = mayNeedComma && !gapHasComma(text, gapStart, closeAt);
  const multiline = text.slice(gapStart, closeAt).includes("\n");
  const content = multiline ? `  ${comma ? "," : ""}${piece}\n` : `${comma ? "," : ""}${piece}`;
  return applyEdits(text, [{ offset: closeAt, length: 0, content }]);
}

function gapHasComma(text: string, from: number, to: number): boolean {
  const scanner = createScanner(text, false);
  scanner.setPosition(from);
  for (;;) {
    const kind = scanner.scan();
    if (kind === SyntaxKind.EOF || scanner.getTokenOffset() >= to) {
      return false;
    }
    if (kind === SyntaxKind.CommaToken) {
      return true;
    }
  }
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
