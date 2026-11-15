// The text of the usage view. This file must not import vscode, so it stays plain Node code.

export type TaskKind = "edit" | "generate" | "question" | "terminal";

/** One QuickK API call. It never holds the prompt, the code or the API key. */
export interface UsageEntry {
  /** Milliseconds since 1970: an absolute instant. */
  time: number;
  model: string;
  apiAddress: string;
  taskKind: TaskKind;
  /** null means unknown. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** Kept so a later ticket can price cached input. Not printed. null means unknown. */
  cachedInputTokens: number | null;
  /** null means unknown. */
  estimatedCost: number | null;
}

export const USAGE_WARNING = "These figures are estimates. Your provider's bill can differ.";

const pad = (value: number) => String(value).padStart(2, "0");

/** Year-month-day and hour:minute in this computer's calendar. */
function localTime(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tokens(count: number | null): string {
  return count === null ? "unknown" : String(count);
}

/** A dollar amount with a leading $ and four digits, rounding half away from zero. */
function dollars(amount: number): string {
  // toPrecision drops float noise, so a figure that is exactly half way (0.00015) rounds up.
  const tenThousandths = Math.round(Number((amount * 10000).toPrecision(12)));
  return `$${(tenThousandths / 10000).toFixed(4)}`;
}

function block(title: string, entries: UsageEntry[]): string[] {
  const sum = (pick: (entry: UsageEntry) => number | null) =>
    entries.reduce((total, entry) => total + (pick(entry) ?? 0), 0);
  // The sum adds the full stored figures. With no priced entry it is unknown, not $0.0000.
  const priced = entries.flatMap((entry) => (entry.estimatedCost === null ? [] : [entry.estimatedCost]));
  return [
    title,
    `Estimated cost: ${priced.length === 0 ? "unknown" : dollars(priced.reduce((total, cost) => total + cost, 0))}`,
    `Input tokens: ${sum((entry) => entry.inputTokens)}`,
    `Output tokens: ${sum((entry) => entry.outputTokens)}`,
    `Entries with no estimated cost: ${entries.filter((entry) => entry.estimatedCost === null).length}`,
    `Entries missing token counts: ${entries.filter((entry) => entry.inputTokens === null || entry.outputTokens === null).length}`,
  ];
}

function line(entry: UsageEntry): string {
  const cost = entry.estimatedCost === null ? "unknown" : dollars(entry.estimatedCost);
  return [
    localTime(entry.time),
    entry.taskKind,
    entry.model,
    `input ${tokens(entry.inputTokens)}`,
    `output ${tokens(entry.outputTokens)}`,
    cost,
  ].join("  ");
}

/** The whole text of the usage view. `now` decides what "today" and "this month" mean. */
export function renderUsageView(entries: UsageEntry[], now: number): string {
  const today = new Date(now);
  const sameMonth = (entry: UsageEntry) => {
    const date = new Date(entry.time);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  };
  const sameDay = (entry: UsageEntry) => sameMonth(entry) && new Date(entry.time).getDate() === today.getDate();

  const newestFirst = [...entries].sort((a, b) => b.time - a.time);
  const lines = [
    USAGE_WARNING,
    "",
    ...block("Today", entries.filter(sameDay)),
    "",
    ...block("This month", entries.filter(sameMonth)),
    "",
    ...block("All time", entries),
    "",
    "Calls",
    ...(newestFirst.length === 0 ? ["There are no calls yet."] : newestFirst.map(line)),
    "",
  ];
  return lines.join("\n");
}
