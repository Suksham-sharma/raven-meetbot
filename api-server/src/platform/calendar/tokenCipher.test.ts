import { beforeEach, describe, expect, it } from "vitest";
import systemConfig from "../config";
import { decryptCalendarToken, encryptCalendarToken } from "./tokenCipher";

describe("calendar token cipher", () => {
  beforeEach(() => {
    systemConfig.CALENDAR_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("round trips without exposing the token", () => {
    const token = "refresh-token-value";
    const encrypted = encryptCalendarToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptCalendarToken(encrypted)).toBe(token);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptCalendarToken("refresh-token-value");
    expect(() => decryptCalendarToken(`${encrypted.slice(0, -1)}x`)).toThrow();
  });
});
