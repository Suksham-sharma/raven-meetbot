import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import systemConfig from "../config";

function key(): Buffer {
  const value = Buffer.from(systemConfig.CALENDAR_TOKEN_KEY, "base64");
  if (value.length !== 32) {
    throw new Error("CALENDAR_TOKEN_KEY must be a base64-encoded 32-byte key");
  }
  return value;
}

export function encryptCalendarToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptCalendarToken(value: string): string {
  const parts = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3) throw new Error("invalid calendar token payload");
  const [iv, tag, encrypted] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
