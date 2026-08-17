import { createHash } from "crypto";

export function actionHash(meetingId: string, kind: string, evidence: string | null): string {
  const identity = (evidence ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${meetingId}|${kind}|${identity}`).digest("hex");
}
