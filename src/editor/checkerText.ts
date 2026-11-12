import { SessionMode } from "./sessionHistory";

/**
 * The text the TypeScript checker should see while a proposal is open.
 * The old lines stay in the document (so Accept and Reject stay the same)
 * but the checker treats them as blank lines. Line numbers of the new code
 * stay the same, so squiggles still land on the right line.
 */

export interface HiddenLines {
  /** First hidden line. The first line of the file is 0. */
  startLine: number;
  /** How many lines to hide. */
  lineCount: number;
}

export interface ShadowInput {
  state: "generating" | "review" | "detached" | "closed";
  mode: SessionMode;
  startLine: number;
  originalLineCount: number;
  greenLineCount: number;
}

/** The old lines, while both copies are in the file. Otherwise nothing. */
export function hiddenRange(input: ShadowInput): HiddenLines | undefined {
  if (input.mode !== "edit" || (input.state !== "review" && input.state !== "generating")) {
    return undefined;
  }
  if (input.originalLineCount < 1 || input.greenLineCount < 1) {
    return undefined;
  }
  return { startLine: input.startLine, lineCount: input.originalLineCount };
}

/** The path the TypeScript server uses for this document. */
export function tsServerPath(uri: { scheme: string; authority: string; path: string; fsPath: string }): string {
  if (uri.scheme === "file") {
    return uri.fsPath;
  }
  const authority = uri.authority || "ts-nul-authority";
  const pathPart = uri.path.startsWith("/") ? uri.path : `/${uri.path}`;
  return `^/${uri.scheme}/${authority}${pathPart}`;
}

/** True when two TypeScript server paths name the same file. */
export function sameTsPath(a: string, b: string): boolean {
  const left = a.replace(/\\/g, "/");
  const right = b.replace(/\\/g, "/");
  if (left === right) {
    return true;
  }
  return (process.platform === "win32" || process.platform === "darwin") && left.toLowerCase() === right.toLowerCase();
}

export function checkerText(text: string, hidden: HiddenLines): string {
  if (hidden.lineCount <= 0 || hidden.startLine < 0) {
    return text;
  }
  const lines = text.split("\n");
  const end = Math.min(lines.length, hidden.startLine + hidden.lineCount);
  let changed = false;
  for (let i = hidden.startLine; i < end; i++) {
    if (lines[i] !== "") {
      lines[i] = "";
      changed = true;
    }
  }
  return changed ? lines.join("\n") : text;
}
