// Adapter contract for v3 agent actions. One adapter per action kind; adding a
// tool = one new file implementing this + a registry entry. execute() is only
// ever called from the approve path — proposing never touches an external API.

export interface ExecuteResult {
  externalId?: string;
  url?: string;
  detail?: string;
}

export interface ActionAdapter<P = unknown> {
  kind: string;
  // Human-readable summary for the approval preview.
  describe(payload: P): string;
  // null when valid, else the validation error.
  validate(payload: unknown): string | null;
  configured(): boolean;
  execute(payload: P): Promise<ExecuteResult>;
}

export class AdapterConfigError extends Error {
  constructor(kind: string, what: string) {
    super(`${kind} adapter not configured: ${what}`);
    this.name = "AdapterConfigError";
  }
}
