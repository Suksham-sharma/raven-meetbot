
export interface ExecuteResult {
  externalId?: string;
  url?: string;
  detail?: string;
}

export interface ActionAdapter<P = unknown> {
  kind: string;
  describe(payload: P): string;
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
