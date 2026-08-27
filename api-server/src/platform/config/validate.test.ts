import { describe, expect, it } from "vitest";
import { DEV_JWT_SECRET, assertConfig, collectConfigErrors } from "./validate";

const key32 = Buffer.alloc(32, 7).toString("base64");

describe("collectConfigErrors", () => {
  it("accepts an empty dev environment", () => {
    expect(collectConfigErrors({})).toEqual([]);
  });

  it("requires the production secrets", () => {
    const errors = collectConfigErrors({ NODE_ENV: "production" });
    expect(errors).toHaveLength(4);
    expect(errors.join("\n")).toContain("JWT_SECRET must be set in production");
  });

  it("rejects the committed dev secret in production", () => {
    const errors = collectConfigErrors({
      NODE_ENV: "production",
      JWT_SECRET: DEV_JWT_SECRET,
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      WEB_APP_URL: "https://x",
    });
    expect(errors).toEqual([
      "JWT_SECRET is still the committed dev value — tokens are forgeable",
    ]);
  });

  it("treats whitespace as unset", () => {
    const errors = collectConfigErrors({ NODE_ENV: "production", JWT_SECRET: "   " });
    expect(errors.join("\n")).toContain("JWT_SECRET must be set in production");
  });

  it("passes a fully configured group", () => {
    expect(
      collectConfigErrors({
        R2_ENDPOINT: "https://r2",
        R2_ACCESS_KEY_ID: "id",
        R2_SECRET_ACCESS_KEY: "secret",
      })
    ).toEqual([]);
  });

  it("catches a half-configured group", () => {
    const errors = collectConfigErrors({ R2_ENDPOINT: "https://r2" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("R2 object storage is half-configured");
    expect(errors[0]).toContain("R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY missing");
  });

  it("does not require the Google group when none of it is set", () => {
    expect(collectConfigErrors({ LINEAR_API_KEY: "k", LINEAR_TEAM_ID: "t" })).toEqual([]);
  });

  it("requires an explicit redirect URI once Google is configured", () => {
    const errors = collectConfigErrors({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      CALENDAR_TOKEN_KEY: key32,
    });
    expect(errors[0]).toContain("GOOGLE_REDIRECT_URI missing");
  });

  it("checks the calendar key decodes to 32 bytes", () => {
    const errors = collectConfigErrors({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_REDIRECT_URI: "https://x/callback",
      CALENDAR_TOKEN_KEY: Buffer.alloc(16, 7).toString("base64"),
    });
    expect(errors).toEqual([
      "CALENDAR_TOKEN_KEY must be a base64-encoded 32-byte key (decoded to 16 bytes)",
    ]);
  });

  it("rejects a numeric setting that would silently fall back", () => {
    const errors = collectConfigErrors({ PORT: "30O1" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('PORT="30O1" is not a positive number');
  });

  it("rejects zero and negative numeric settings", () => {
    expect(collectConfigErrors({ JOB_ATTEMPTS: "0" })).toHaveLength(1);
    expect(collectConfigErrors({ JOB_BACKOFF_MS: "-1" })).toHaveLength(1);
  });

  it("accepts valid numeric settings", () => {
    expect(collectConfigErrors({ PORT: "3001", JOB_ATTEMPTS: "3" })).toEqual([]);
  });

  it("reports every problem at once", () => {
    expect(collectConfigErrors({ NODE_ENV: "production", PORT: "nope" })).toHaveLength(5);
  });
});

describe("assertConfig", () => {
  it("is silent on a valid environment", () => {
    expect(() => assertConfig({})).not.toThrow();
  });

  it("throws with every problem listed", () => {
    expect(() => assertConfig({ R2_ENDPOINT: "https://r2", PORT: "nope" })).toThrow(
      /Invalid configuration \(2\)/
    );
  });
});
