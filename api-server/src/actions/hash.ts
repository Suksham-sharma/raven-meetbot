import { createHash } from "crypto";

// Idempotency hash: meeting + kind + the action's EVIDENCE, not its prose.
// The LLM re-words payload text every run (even at temp 0), so hashing the
// payload can't dedupe re-proposals. The evidence quote comes from the ingest
// spine and is stable across runs — it IS the action's identity ("the task
// committed to in this moment"). Evidence-less kinds (the recap) hash to one
// row per meeting+kind.

export function actionHash(meetingId: string, kind: string, evidence: string | null): string {
  const identity = (evidence ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${meetingId}|${kind}|${identity}`).digest("hex");
}
