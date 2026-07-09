import systemConfig from "../config";
import { ActionAdapter, AdapterConfigError, ExecuteResult } from "./adapter";

// Posts to a Slack incoming webhook (zero-OAuth v0; bot-token DMs are a later slice).

export interface SlackMessagePayload {
  text: string;
}

export const slackAdapter: ActionAdapter<SlackMessagePayload> = {
  kind: "slack_message",

  describe(p) {
    const first = p.text.split("\n")[0];
    return `Slack message: "${first.length > 80 ? first.slice(0, 77) + "…" : first}"`;
  },

  validate(payload) {
    const p = payload as Partial<SlackMessagePayload> | null;
    if (!p || typeof p !== "object") return "payload must be an object";
    if (!p.text?.trim()) return "text is required";
    return null;
  },

  configured() {
    return Boolean(systemConfig.SLACK_WEBHOOK_URL);
  },

  async execute(p) {
    if (!this.configured()) {
      throw new AdapterConfigError(this.kind, "set SLACK_WEBHOOK_URL");
    }
    const res = await fetch(systemConfig.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: p.text }),
    });
    if (!res.ok) throw new Error(`Slack webhook ${res.status}: ${await res.text()}`);
    return { detail: "posted to Slack" } satisfies ExecuteResult;
  },
};
