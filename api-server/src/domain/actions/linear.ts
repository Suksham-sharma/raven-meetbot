import systemConfig from "../../platform/config/index";
import { ActionAdapter, AdapterConfigError, ExecuteResult } from "./adapter";

export interface LinearIssuePayload {
  issue_title: string;
  description: string;
  owner: string | null;
  due: string | null;
}

const API_URL = "https://api.linear.app/graphql";

export const linearAdapter: ActionAdapter<LinearIssuePayload> = {
  kind: "linear_issue",

  describe(p) {
    return `Linear issue: "${p.issue_title}"${p.owner ? ` (owner: ${p.owner})` : ""}${p.due ? ` due ${p.due}` : ""}`;
  },

  validate(payload) {
    const p = payload as Partial<LinearIssuePayload> | null;
    if (!p || typeof p !== "object") return "payload must be an object";
    if (!p.issue_title?.trim()) return "issue_title is required";
    if (typeof p.description !== "string") return "description is required";
    return null;
  },

  configured() {
    return Boolean(systemConfig.LINEAR_API_KEY && systemConfig.LINEAR_TEAM_ID);
  },

  async execute(p) {
    if (!this.configured()) {
      throw new AdapterConfigError(this.kind, "set LINEAR_API_KEY + LINEAR_TEAM_ID");
    }
    const meta = [
      p.owner ? `Owner: ${p.owner}` : null,
      p.due ? `Due: ${p.due}` : null,
    ].filter(Boolean);
    const description = meta.length ? `${p.description}\n\n---\n${meta.join(" · ")}` : p.description;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: systemConfig.LINEAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }`,
        variables: {
          input: {
            teamId: systemConfig.LINEAR_TEAM_ID,
            title: p.issue_title,
            description,
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as {
      data?: { issueCreate?: { success: boolean; issue?: { id: string; identifier: string; url: string } } };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) throw new Error(`Linear: ${json.errors[0].message}`);
    const issue = json.data?.issueCreate?.issue;
    if (!json.data?.issueCreate?.success || !issue) throw new Error("Linear: issueCreate did not succeed");

    return { externalId: issue.identifier, url: issue.url, detail: `created ${issue.identifier}` } satisfies ExecuteResult;
  },
};
