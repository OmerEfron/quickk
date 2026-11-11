/** One Setup step. `ask` returns false when the user declined. */
export interface SetupStep {
  id: string;
  isDone(): Promise<boolean>;
  ask(): Promise<boolean>;
}

/** The part of vscode.Memento that Setup uses. */
export interface SetupState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

const OFFERED = "quickk.setup.offered";
const DECLINED = "quickk.setup.declined";

/** Calls `offer` only if Setup was never offered before. */
export async function offerSetupOnce(state: SetupState, offer: () => void): Promise<void> {
  if (state.get<boolean>(OFFERED)) {
    return;
  }
  await state.update(OFFERED, true);
  offer();
}

/**
 * Runs the steps in order and returns the ids of the steps it asked.
 * An automatic run skips the steps the user declined before.
 */
export async function runSetup(steps: SetupStep[], state: SetupState, auto: boolean): Promise<string[]> {
  const asked: string[] = [];
  for (const step of steps) {
    const declined = state.get<string[]>(DECLINED) ?? [];
    if ((auto && declined.includes(step.id)) || (await step.isDone())) {
      continue;
    }
    asked.push(step.id);
    const others = declined.filter((id) => id !== step.id);
    await state.update(DECLINED, (await step.ask()) ? others : [...others, step.id]);
  }
  return asked;
}
