import { describe, expect, it } from "vitest";
import { linearAdapter } from "./linear";
import { slackAdapter } from "./slack";
import { getAdapter, ACTION_KINDS } from "./registry";

describe("adapter registry", () => {
  it("resolves every declared kind and rejects unknowns", () => {
    for (const kind of ACTION_KINDS) expect(getAdapter(kind)?.kind).toBe(kind);
    expect(getAdapter("jira_ticket")).toBeNull();
  });
});

describe("linearAdapter.validate", () => {
  it("accepts a complete payload", () => {
    expect(
      linearAdapter.validate({ issue_title: "Fix X", description: "ctx", owner: null, due: null })
    ).toBeNull();
  });
  it("rejects missing title or description", () => {
    expect(linearAdapter.validate({ description: "d" })).toMatch(/issue_title/);
    expect(linearAdapter.validate({ issue_title: " " })).toMatch(/issue_title/);
    expect(linearAdapter.validate({ issue_title: "t" })).toMatch(/description/);
    expect(linearAdapter.validate(null)).toMatch(/object/);
  });
});

describe("slackAdapter.validate", () => {
  it("accepts text and rejects blank", () => {
    expect(slackAdapter.validate({ text: "recap" })).toBeNull();
    expect(slackAdapter.validate({ text: "  " })).toMatch(/text/);
    expect(slackAdapter.validate("nope")).toMatch(/object/);
  });
});

describe("describe()", () => {
  it("summarizes payloads for the approval preview", () => {
    expect(
      linearAdapter.describe({ issue_title: "Fix X", description: "", owner: "sam", due: "friday" })
    ).toContain("Fix X");
    expect(slackAdapter.describe({ text: "line1\nline2" })).toContain("line1");
  });
});
