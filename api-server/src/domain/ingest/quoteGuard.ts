
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function verifyQuote(quote: string, transcript: string): boolean {
  const needle = normalize(quote);
  if (needle.length === 0) return false;
  return normalize(transcript).includes(needle);
}
