import { describe, expect, it } from "vitest";
import { verifyQuote } from "./quoteGuard";

const transcript = "Sarah: Postgres. We need relational integrity for the billing tables.";

describe("verifyQuote", () => {
  it("accepts an exact substring", () => {
    expect(verifyQuote("relational integrity for the billing tables", transcript)).toBe(true);
  });

  it("accepts despite punctuation and casing differences", () => {
    expect(verifyQuote("Relational integrity, for the billing tables!", transcript)).toBe(true);
  });

  it("rejects a quote not in the transcript (likely hallucinated)", () => {
    expect(verifyQuote("we chose MongoDB for flexibility", transcript)).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(verifyQuote("   ", transcript)).toBe(false);
  });
});
