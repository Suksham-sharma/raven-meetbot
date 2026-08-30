import { beforeEach, describe, expect, it } from "vitest";
import systemConfig from "../config";
import { decryptCalendarToken, encryptCalendarToken } from "./tokenCipher";

function flipByteInSegment(payload: string, segmentIndex: number): string {
  const segments = payload.split(".");
  const bytes = Buffer.from(segments[segmentIndex], "base64url");
  const target = Math.floor(bytes.length / 2);
  bytes[target] ^= 0xff;
  segments[segmentIndex] = bytes.toString("base64url");
  return segments.join(".");
}

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

  it.each([
    ["iv", 0],
    ["tag", 1],
    ["ciphertext", 2],
  ])("rejects a tampered %s segment", (_name, segmentIndex) => {
    const encrypted = encryptCalendarToken("refresh-token-value");
    const tampered = flipByteInSegment(encrypted, segmentIndex as number);
    expect(tampered).not.toBe(encrypted);
    expect(() => decryptCalendarToken(tampered)).toThrow();
  });
});
