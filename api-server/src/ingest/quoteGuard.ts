// Hallucination guard: verify an LLM-extracted evidence_quote actually appears in
// the transcript, so fabricated decisions/action-items get dropped before they
// poison retrieval. Normalizes case/punctuation/whitespace, then checks substring —
// the conservative floor: if the model paraphrased instead of quoting, we drop it.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip punctuation/symbols
    .replace(/\s+/g, " ")
    .trim();
}

export function verifyQuote(quote: string, transcript: string): boolean {
  const needle = normalize(quote);
  if (needle.length === 0) return false;
  return normalize(transcript).includes(needle);
}
