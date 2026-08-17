import type { ActionAdapter } from "./adapter";
import { linearAdapter } from "./linear";
import { slackAdapter } from "./slack";

const adapters: Record<string, ActionAdapter<never>> = {
  [linearAdapter.kind]: linearAdapter as ActionAdapter<never>,
  [slackAdapter.kind]: slackAdapter as ActionAdapter<never>,
};

export const ACTION_KINDS = Object.keys(adapters);

export function getAdapter(kind: string): ActionAdapter<never> | null {
  return adapters[kind] ?? null;
}
