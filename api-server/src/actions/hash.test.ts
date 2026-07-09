import { describe, expect, it } from "vitest";
import { actionHash } from "./hash";

describe("actionHash", () => {
  it("keys on evidence, so re-worded payload prose cannot duplicate an action", () => {
    const quote = "Jordan, can you write up the threat model?";
    expect(actionHash("m1", "linear_issue", quote)).toBe(
      actionHash("m1", "linear_issue", "  jordan, CAN you write up the   threat model? ")
    );
  });

  it("differs by meeting, kind, and evidence", () => {
    const base = actionHash("m1", "linear_issue", "quote a");
    expect(actionHash("m2", "linear_issue", "quote a")).not.toBe(base);
    expect(actionHash("m1", "slack_message", "quote a")).not.toBe(base);
    expect(actionHash("m1", "linear_issue", "quote b")).not.toBe(base);
  });

  it("evidence-less actions collapse to one per meeting+kind", () => {
    expect(actionHash("m1", "slack_message", null)).toBe(actionHash("m1", "slack_message", ""));
  });
});
